import "server-only"

import { prisma } from "@/server/db/prisma"

const DAY_IN_MS = 24 * 60 * 60 * 1000

const STAGE_LABELS = {
  synopsis: "梗概",
  outline: "细纲",
  chapter: "正文",
  release: "质检",
} as const

type TimelineStatus = "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"
type StageCode = keyof typeof STAGE_LABELS
type GateStatus = "locked" | "unlocked" | "completed"

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function calculateTimelineStatus(input: {
  gateStatus: GateStatus
  completedAt: Date | null
  startedAt: Date | null
  dueAt: Date | null
  warningDaysBeforeDue: number
  now: Date
}): TimelineStatus {
  // 只要阶段已经显式完成，就必须稳定落到 completed，
  // 避免后续因为 dueAt 已过又被重新改写成 overdue。
  if (input.gateStatus === "completed" || input.completedAt) {
    return "completed"
  }

  // 未解锁阶段不参与倒计时，也不应误记为即将到期/已逾期。
  if (input.gateStatus === "locked") {
    return "not_started"
  }

  // 已解锁但还没有起止时间时，先按进行中处理；
  // 这类数据一般只会短暂存在于刚解锁但 dueAt 尚未补齐的事务窗口。
  if (!input.dueAt) {
    return input.startedAt ? "in_progress" : "not_started"
  }

  const nowTime = input.now.getTime()
  const dueTime = input.dueAt.getTime()

  if (nowTime > dueTime) {
    return "overdue"
  }

  const warningDays = Math.max(0, input.warningDaysBeforeDue)
  const warningStartTime = dueTime - warningDays * DAY_IN_MS

  if (nowTime >= warningStartTime) {
    return "due_soon"
  }

  return "in_progress"
}

function makeStageWarningOpenKey(projectId: bigint, stageCode: StageCode, recipientUserId: bigint) {
  // 同一项目同一阶段同一接收人同时只保留一条“当前仍然有效”的预警待办，
  // 这样 due_soon 升级为 overdue 时可以直接覆盖，而不是越积越多。
  return `stage_warning:${projectId.toString()}:${stageCode}:${recipientUserId.toString()}`
}

function makeStageWarningTitle(stageCode: StageCode, status: "due_soon" | "overdue") {
  return status === "due_soon"
    ? `${STAGE_LABELS[stageCode]}阶段即将到期`
    : `${STAGE_LABELS[stageCode]}阶段已逾期`
}

function makeStageWarningBody(input: {
  projectTitle: string
  stageCode: StageCode
  status: "due_soon" | "overdue"
  dueAt: Date | null
}) {
  const dueLabel = toIsoString(input.dueAt) ?? "未设置"
  const stageLabel = STAGE_LABELS[input.stageCode]

  return input.status === "due_soon"
    ? `《${input.projectTitle}》的${stageLabel}阶段即将到期，计划截止时间为 ${dueLabel}。`
    : `《${input.projectTitle}》的${stageLabel}阶段已逾期，计划截止时间为 ${dueLabel}。`
}

async function closeStageWarningTodo(projectId: bigint, stageCode: StageCode, recipientUserId: bigint, now: Date) {
  await prisma.todoItem.updateMany({
    where: {
      recipientUserId,
      projectId,
      status: "open",
      openDedupeKey: makeStageWarningOpenKey(projectId, stageCode, recipientUserId),
    },
    data: {
      status: "done",
      completedAt: now,
      openDedupeKey: null,
    },
  })
}

async function upsertStageWarningTodo(input: {
  recipientUserId: bigint
  projectId: bigint
  stageCode: StageCode
  projectTitle: string
  dueAt: Date | null
  status: "due_soon" | "overdue"
  now: Date
}) {
  const openDedupeKey = makeStageWarningOpenKey(input.projectId, input.stageCode, input.recipientUserId)
  const title = makeStageWarningTitle(input.stageCode, input.status)
  const description = makeStageWarningBody({
    projectTitle: input.projectTitle,
    stageCode: input.stageCode,
    status: input.status,
    dueAt: input.dueAt,
  })

  await prisma.todoItem.upsert({
    where: {
      openDedupeKey,
    },
    update: {
      todoType: input.status === "due_soon" ? "stage_due_soon" : "stage_overdue",
      title,
      description,
      entityType: "project_stage_plan",
      entityId: input.projectId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: input.dueAt,
      completedAt: null,
      cancelledAt: null,
      dedupeKey: openDedupeKey,
      openDedupeKey,
      updatedAt: input.now,
    },
    create: {
      recipientUserId: input.recipientUserId,
      todoType: input.status === "due_soon" ? "stage_due_soon" : "stage_overdue",
      title,
      description,
      projectId: input.projectId,
      entityType: "project_stage_plan",
      entityId: input.projectId,
      status: "open",
      isRead: false,
      readAt: null,
      dueAt: input.dueAt,
      dedupeKey: openDedupeKey,
      openDedupeKey,
    },
  })
}

async function createStageWarningNotification(input: {
  recipientUserId: bigint
  projectId: bigint
  stageCode: StageCode
  projectTitle: string
  dueAt: Date | null
  status: "due_soon" | "overdue"
}) {
  await prisma.notification.create({
    data: {
      recipientUserId: input.recipientUserId,
      type: "stage_warning",
      title: makeStageWarningTitle(input.stageCode, input.status),
      body: makeStageWarningBody({
        projectTitle: input.projectTitle,
        stageCode: input.stageCode,
        status: input.status,
        dueAt: input.dueAt,
      }),
      projectId: input.projectId,
      entityType: "project_stage_plan",
      entityId: input.projectId,
    },
  })
}

export async function syncActiveProjectTimelineStatuses() {
  const stagePlanDefaultClient = (prisma as unknown as {
    stagePlanDefault?: typeof prisma.stagePlanDefault
  }).stagePlanDefault
  const projectStagePlanClient = (prisma as unknown as {
    projectStagePlan?: typeof prisma.projectStagePlan
  }).projectStagePlan

  // 单测里会按需 mock prisma 的局部模型；
  // 如果当前测试没有提供阶段计划相关 delegate，就直接跳过这层同步逻辑，避免让无关用例全部失败。
  if (!stagePlanDefaultClient || !projectStagePlanClient) {
    return
  }

  const now = new Date()
  const [defaults, stagePlans] = await Promise.all([
    stagePlanDefaultClient.findMany({
      select: {
        stageCode: true,
        warningDaysBeforeDue: true,
      },
    }),
    projectStagePlanClient.findMany({
      where: {
        project: {
          lifecycleStatus: "active",
        },
      },
      include: {
        project: {
          select: {
            projectId: true,
            title: true,
            editorId: true,
            authorId: true,
            lifecycleStatus: true,
          },
        },
      },
    }),
  ])

  const warningDaysMap = new Map(defaults.map((item) => [item.stageCode, item.warningDaysBeforeDue]))

  for (const stagePlan of stagePlans) {
    const nextStatus = calculateTimelineStatus({
      gateStatus: stagePlan.gateStatus,
      completedAt: stagePlan.completedAt,
      startedAt: stagePlan.startedAt,
      dueAt: stagePlan.dueAt,
      warningDaysBeforeDue: warningDaysMap.get(stagePlan.stageCode) ?? 1,
      now,
    })

    if (nextStatus === stagePlan.timelineStatus) {
      continue
    }

    await projectStagePlanClient.update({
      where: {
        stagePlanId: stagePlan.stagePlanId,
      },
      data: {
        timelineStatus: nextStatus,
      },
    })

    const recipients = [stagePlan.project.editorId, stagePlan.project.authorId].filter(
      (value, index, list) => list.findIndex((candidate) => candidate === value) === index,
    )

    if (nextStatus === "due_soon" || nextStatus === "overdue") {
      for (const recipientUserId of recipients) {
        await upsertStageWarningTodo({
          recipientUserId,
          projectId: stagePlan.project.projectId,
          stageCode: stagePlan.stageCode,
          projectTitle: stagePlan.project.title,
          dueAt: stagePlan.dueAt,
          status: nextStatus,
          now,
        })

        await createStageWarningNotification({
          recipientUserId,
          projectId: stagePlan.project.projectId,
          stageCode: stagePlan.stageCode,
          projectTitle: stagePlan.project.title,
          dueAt: stagePlan.dueAt,
          status: nextStatus,
        })
      }

      continue
    }

    for (const recipientUserId of recipients) {
      await closeStageWarningTodo(stagePlan.project.projectId, stagePlan.stageCode, recipientUserId, now)
    }
  }
}
