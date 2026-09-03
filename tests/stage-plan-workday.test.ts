import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    project: {
      findFirst: vi.fn(),
    },
    projectStagePlan: {
      updateMany: vi.fn(),
    },
    projectStagePlanChange: {
      create: vi.fn(),
    },
    workdayException: {
      findMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      project: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { updateProjectStagePlans } from "@/server/modules/project/project.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const editorActor: ApiCurrentUser = {
  id: "100",
  userId: 100n,
  username: "editor",
  name: "编辑",
  role: "editor",
  status: "active",
  preferredLocale: "zh-CN",
  email: "editor@example.test",
}

const authorActor: ApiCurrentUser = {
  ...editorActor,
  id: "200",
  userId: 200n,
  username: "author",
  name: "作者",
  role: "author",
  email: "author@example.test",
}

function makeProject(input: { completed?: boolean; lockVersion?: number } = {}) {
  const completed = input.completed ?? false
  const now = new Date("2026-09-02T08:00:00.000Z")

  return {
    projectId: 10n,
    sourceSiId: 20n,
    title: "工作日计划测试项目",
    intro: null,
    editorId: editorActor.userId,
    authorId: authorActor.userId,
    currentStage: "synopsis",
    lifecycleStatus: "active",
    releaseStatus: "locked",
    createdBy: editorActor.userId,
    createdAt: now,
    updatedAt: now,
    completedAt: null,
    archivedAt: null,
    cancelledAt: null,
    sourceSi: {
      siId: 20n,
      title: "来源 SI",
      status: "converted",
    },
    editor: {
      userId: editorActor.userId,
      username: editorActor.username,
      displayName: editorActor.name,
    },
    author: {
      userId: authorActor.userId,
      username: authorActor.username,
      displayName: authorActor.name,
    },
    stagePlans: [
      {
        stagePlanId: 30n,
        projectId: 10n,
        stageCode: "synopsis",
        gateStatus: completed ? "completed" : "unlocked",
        timelineStatus: completed ? "completed" : "in_progress",
        planDays: 2,
        plannedStartAt: new Date("2026-09-04T00:00:00.000Z"),
        plannedEndAt: new Date("2026-09-07T00:00:00.000Z"),
        lockVersion: input.lockVersion ?? 3,
        unlockedAt: now,
        startedAt: now,
        dueAt: new Date("2026-09-07T23:59:59.999Z"),
        completedAt: completed ? now : null,
        createdAt: now,
        updatedAt: now,
        changes: [],
      },
    ],
    docs: [],
  }
}

describe("updateProjectStagePlans", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const project = makeProject()
    mockTx.project.findFirst.mockResolvedValue(project)
    mockPrisma.project.findFirst.mockResolvedValue(project)
    mockTx.projectStagePlan.updateMany.mockResolvedValue({ count: 1 })
    mockTx.projectStagePlanChange.create.mockResolvedValue({})
    mockTx.workdayException.findMany.mockResolvedValue([
      {
        date: new Date("2026-09-07T00:00:00.000Z"),
        isWorkday: false,
      },
    ])
    mockTx.operationLog.create.mockResolvedValue({})
  })

  it("按计划工作日数计算结束日，并只修改计划字段、不覆盖实际时间", async () => {
    await updateProjectStagePlans(editorActor, "10", {
      reason: "避开节假日调整排期",
      items: [
        {
          stage: "synopsis",
          plannedStartAt: "2026-09-04",
          planDays: 2,
          lockVersion: 3,
        },
      ],
    })

    const update = mockTx.projectStagePlan.updateMany.mock.calls[0][0]
    expect(update.where).toEqual({ stagePlanId: 30n, lockVersion: 3 })
    expect(update.data).toEqual({
      plannedStartAt: new Date("2026-09-04T00:00:00.000Z"),
      plannedEndAt: new Date("2026-09-08T00:00:00.000Z"),
      planDays: 2,
      dueAt: new Date("2026-09-08T23:59:59.999Z"),
      lockVersion: { increment: 1 },
    })
    expect(update.data).not.toHaveProperty("startedAt")
    expect(update.data).not.toHaveProperty("completedAt")
    expect(mockTx.projectStagePlanChange.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        stagePlanId: 30n,
        changedBy: editorActor.userId,
        reason: "避开节假日调整排期",
        afterJson: {
          plannedStartAt: "2026-09-04T00:00:00.000Z",
          plannedEndAt: "2026-09-08T00:00:00.000Z",
          planDays: 2,
        },
      }),
    })
  })

  it("只修改结束日时按闭区间反算工作日数", async () => {
    mockTx.workdayException.findMany.mockResolvedValue([])

    await updateProjectStagePlans(editorActor, "10", {
      reason: "按交付日期调整",
      items: [
        {
          stage: "synopsis",
          plannedEndAt: "2026-09-08",
          lockVersion: 3,
        },
      ],
    })

    expect(mockTx.projectStagePlan.updateMany).toHaveBeenCalledWith({
      where: { stagePlanId: 30n, lockVersion: 3 },
      data: expect.objectContaining({
        planDays: 3,
        plannedEndAt: new Date("2026-09-08T00:00:00.000Z"),
      }),
    })
  })

  it("作者不能调整阶段计划，已完成阶段也不可修改", async () => {
    await expect(
      updateProjectStagePlans(authorActor, "10", {
        reason: "作者尝试修改",
        items: [{ stage: "synopsis", planDays: 3, lockVersion: 3 }],
      }),
    ).rejects.toMatchObject({ code: "STAGE_PLAN_EDITOR_ONLY" })

    mockTx.project.findFirst.mockResolvedValue(makeProject({ completed: true }))
    await expect(
      updateProjectStagePlans(editorActor, "10", {
        reason: "修改已完成阶段",
        items: [{ stage: "synopsis", planDays: 3, lockVersion: 3 }],
      }),
    ).rejects.toMatchObject({ code: "STAGE_PLAN_COMPLETED" })

    expect(mockTx.projectStagePlanChange.create).not.toHaveBeenCalled()
  })

  it("使用锁版本阻止并发请求覆盖已保存计划", async () => {
    mockTx.projectStagePlan.updateMany.mockResolvedValue({ count: 0 })

    await expect(
      updateProjectStagePlans(editorActor, "10", {
        reason: "并发更新",
        items: [{ stage: "synopsis", planDays: 3, lockVersion: 3 }],
      }),
    ).rejects.toMatchObject({ code: "STAGE_PLAN_VERSION_CONFLICT" })

    expect(mockTx.projectStagePlanChange.create).not.toHaveBeenCalled()
    expect(mockTx.operationLog.create).not.toHaveBeenCalled()
  })

  it("把格式正确但实际不存在的日历日期转换为稳定业务错误", async () => {
    await expect(
      updateProjectStagePlans(editorActor, "10", {
        reason: "无效日期测试",
        items: [{ stage: "synopsis", plannedStartAt: "2026-02-30", planDays: 2, lockVersion: 3 }],
      }),
    ).rejects.toMatchObject({ code: "STAGE_PLAN_DATE_INVALID", status: 400 })

    expect(mockTx.projectStagePlan.updateMany).not.toHaveBeenCalled()
  })
})
