import "server-only"

import { Prisma } from "@prisma/client"

import { getAdminDashboard, getAdminReport } from "@/server/modules/admin/admin.service"
import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { BadgeTone, DocStatus } from "@/types/domain"
import type {
  AuthorDashboardStats,
  AuthorReportStats,
  EditorDashboardStats,
  EditorReportStats,
  NotificationCategory,
  NotificationItemView,
  ReviewQueueItem,
  TodoItemView,
  TodoType,
  WorkspaceDashboardPayload,
  WorkspaceReportPayload,
} from "@/types/workbench"

type RangeKey = "7d" | "30d" | "90d" | "all"

const userSummarySelect = {
  userId: true,
  username: true,
  displayName: true,
} satisfies Prisma.UserSelect

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function toIsoString(value: Date | null | undefined) {
  return value ? value.toISOString() : null
}

function parseBigIntId(value: string | number | bigint, label: string) {
  const raw = String(value)

  if (!/^\d+$/.test(raw)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_ID",
      message: `${label} 必须是数字 ID`,
    })
  }

  return BigInt(raw)
}

function startDateByRange(range: RangeKey) {
  if (range === "all") {
    return null
  }

  const now = new Date()
  const days = range === "7d" ? 7 : range === "30d" ? 30 : 90
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000)
}

function dbDocStatusToUiStatus(status: "draft" | "submitted" | "rejected" | "approved"): DocStatus {
  return status === "rejected" ? "returned" : status
}

function dbDocTypeToUiType(docType: "synopsis" | "outline" | "chapter" | "release") {
  // 前端和接口层已经统一切回数据库真实编码，这里不再做 manuscript / qc 的别名映射。
  return docType
}

function statusToTone(status: DocStatus): BadgeTone {
  if (status === "approved") return "success"
  if (status === "returned") return "warning"
  if (status === "submitted") return "info"
  return "neutral"
}

function makeProjectVisibilityWhere(actor: ApiCurrentUser): Prisma.ProjectWhereInput {
  if (actor.role === "admin") {
    return {}
  }

  if (actor.role === "editor") {
    return {
      editorId: actor.userId,
    }
  }

  return {
    authorId: actor.userId,
  }
}

function makeDocVisibilityWhere(actor: ApiCurrentUser): Prisma.DocWhereInput {
  return {
    isDeleted: false,
    project: makeProjectVisibilityWhere(actor),
  }
}

function notificationCategory(rawType: string): NotificationCategory {
  if (rawType === "si_preissued") return "si_prerelease"
  if (rawType === "project_created_from_si") return "si_convert"
  if (rawType === "doc_submitted_for_review") return "doc_submit"
  if (rawType === "doc_approved") return "doc_approve"
  if (rawType === "doc_returned") return "doc_return"
  if (rawType === "register_pending_approval") return "approval_request"
  if (rawType === "forgot_password_requested") return "forgot_password_request"
  if (rawType === "project_enter_qc") return "enter_qc"
  if (rawType === "project_completed") return "project_done"
  if (rawType === "binding_created" || rawType === "binding_removed" || rawType === "project_assignment_changed") {
    return "binding_change"
  }
  if (rawType === "register_approved" || rawType === "register_rejected") {
    return "approval_result"
  }
  return "system"
}

function notificationHref(input: {
  category: NotificationCategory
  projectId: bigint | null
  docId: bigint | null
  siId: bigint | null
  preissueId: bigint | null
  actorRole: ApiCurrentUser["role"]
}) {
  if (input.category === "si_prerelease") {
    if (input.actorRole === "author" && input.preissueId) {
      return `/my-si/${input.preissueId.toString()}`
    }

    if (input.siId) {
      return `/si/${input.siId.toString()}`
    }
  }

  if (input.category === "si_convert" && input.projectId) {
    return `/projects/${input.projectId.toString()}`
  }

  if (input.category === "doc_submit") {
    return input.docId ? `/review?docId=${input.docId.toString()}` : "/review"
  }

  if ((input.category === "doc_return" || input.category === "doc_approve") && input.projectId) {
    return `/projects/${input.projectId.toString()}`
  }

  if ((input.category === "enter_qc" || input.category === "stage_unlock") && input.projectId) {
    return `/projects/${input.projectId.toString()}/qc`
  }

  if (input.category === "project_done" && input.projectId) {
    return `/projects/${input.projectId.toString()}`
  }

  if (input.category === "binding_change") {
    return "/settings"
  }

  if (input.category === "approval_result") {
    return "/login"
  }

  if (input.category === "approval_request") {
    return "/admin/approvals"
  }

  if (input.category === "forgot_password_request") {
    return "/admin/users"
  }

  return "/dashboard"
}

export async function listReviewQueue(actor: ApiCurrentUser) {
  if (actor.role !== "admin" && actor.role !== "editor") {
    throw new ApiError({
      status: 403,
      code: "REVIEW_QUEUE_FORBIDDEN",
      message: "只有编辑或管理员可以查看审稿队列",
    })
  }

  const docs = await prisma.doc.findMany({
    where: {
      ...makeDocVisibilityWhere(actor),
      status: "submitted",
      holderRole: "editor",
    },
    include: {
      project: {
        select: {
          projectId: true,
          title: true,
          author: {
            select: userSummarySelect,
          },
          stagePlans: {
            select: {
              stageCode: true,
              dueAt: true,
            },
          },
        },
      },
      latestRevision: {
        select: {
          handoffNote: true,
          baseRevision: {
            select: {
              cleanText: true,
              plainText: true,
            },
          },
        },
      },
    },
    orderBy: {
      submittedAt: "desc",
    },
  })

  const items: ReviewQueueItem[] = docs.map((doc) => {
    const stagePlan = doc.project.stagePlans.find((plan) => plan.stageCode === doc.stageCode) ?? null
    const previousPreview =
      doc.latestRevision?.baseRevision?.cleanText ??
      doc.latestRevision?.baseRevision?.plainText ??
      null

    return {
      docId: doc.docId.toString(),
      projectId: doc.project.projectId.toString(),
      projectTitle: doc.project.title,
      docType: dbDocTypeToUiType(doc.docType),
      title: doc.title,
      authorName: userName(doc.project.author),
      words: doc.currentWordCount,
      submittedAt: toIsoString(doc.submittedAt),
      submitNote: doc.latestRevision?.handoffNote ?? doc.lastHandoffNote ?? "",
      previewText: (doc.currentCleanText ?? doc.currentPlainText ?? "").slice(0, 240),
      previousPreviewText: previousPreview ? previousPreview.slice(0, 240) : null,
      dueAt: toIsoString(stagePlan?.dueAt),
    }
  })

  return {
    items,
  }
}

export async function listTodos(actor: ApiCurrentUser) {
  // 待办页现在只展示“有持久化真相源”的任务：
  // 也就是直接来自 todo_items 的记录，不再额外拼接 SI 预发、阶段预警等临时列表项。
  const openTodos = await prisma.todoItem.findMany({
    where: {
      recipientUserId: actor.userId,
      status: "open",
    },
    include: {
      project: {
        select: {
          projectId: true,
          title: true,
          author: {
            select: userSummarySelect,
          },
          editor: {
            select: userSummarySelect,
          },
        },
      },
      doc: {
        select: {
          docId: true,
          docType: true,
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  })

  const items: TodoItemView[] = []

  for (const todo of openTodos) {
    if (todo.todoType === "doc_review" && todo.project && todo.doc) {
      items.push({
        id: `todo:${todo.todoId.toString()}`,
        type: "review",
        title: todo.title,
        relatedType: "Doc",
        relatedName: `${todo.project.title} / ${todo.doc.title}`,
        status: "已提交待审",
        statusTone: "info",
        due: toIsoString(todo.dueAt) ?? "—",
        from: userName(todo.project.author),
        createdAt: todo.createdAt.toISOString(),
        read: todo.isRead,
        readAt: toIsoString(todo.readAt),
        href: `/review?docId=${todo.doc.docId.toString()}`,
      })
    }

    if (todo.todoType === "doc_return" && todo.project && todo.doc) {
      items.push({
        id: `todo:${todo.todoId.toString()}`,
        type: "returned",
        title: todo.title,
        relatedType: "Doc",
        relatedName: `${todo.project.title} / ${todo.doc.title}`,
        status: "退回待改",
        statusTone: "warning",
        due: toIsoString(todo.dueAt) ?? "—",
        from: userName(todo.project.editor),
        createdAt: todo.createdAt.toISOString(),
        read: todo.isRead,
        readAt: toIsoString(todo.readAt),
        href: `/projects/${todo.project.projectId.toString()}`,
      })
    }

    if (todo.todoType === "register_approval") {
      items.push({
        id: `todo:${todo.todoId.toString()}`,
        type: "approval",
        title: todo.title,
        relatedType: "用户",
        relatedName: todo.title.replace(/^注册申请待审批：/, ""),
        status: "待审批",
        statusTone: "warning",
        due: "—",
        from: "系统",
        createdAt: todo.createdAt.toISOString(),
        read: todo.isRead,
        readAt: toIsoString(todo.readAt),
        href: "/admin/approvals",
      })
    }
  }

  items.sort((left, right) => right.createdAt.localeCompare(left.createdAt))

  return {
    items,
  }
}

export async function markAllTodosRead(actor: ApiCurrentUser) {
  await prisma.todoItem.updateMany({
    where: {
      recipientUserId: actor.userId,
      status: "open",
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })

  return {
    ok: true,
  }
}

export async function listNotifications(actor: ApiCurrentUser) {
  const notifications = await prisma.notification.findMany({
    where: {
      recipientUserId: actor.userId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: 100,
  })

  const items: NotificationItemView[] = notifications.map((item) => {
    const category = notificationCategory(item.type)

    return {
      id: item.notificationId.toString(),
      rawType: item.type,
      category,
      title: item.title,
      detail: item.body ?? "",
      time: item.createdAt.toISOString(),
      read: item.isRead,
      href: notificationHref({
        category,
        projectId: item.projectId,
        docId: item.docId,
        siId: item.siId,
        preissueId: item.preissueId,
        actorRole: actor.role,
      }),
    }
  })

  return {
    items,
    unreadCount: items.filter((item) => !item.read).length,
  }
}

export async function markNotificationRead(actor: ApiCurrentUser, notificationIdValue: string) {
  const notificationId = parseBigIntId(notificationIdValue, "通知 ID")

  const updated = await prisma.notification.updateMany({
    where: {
      notificationId,
      recipientUserId: actor.userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })

  if (updated.count === 0) {
    const exists = await prisma.notification.findFirst({
      where: {
        notificationId,
        recipientUserId: actor.userId,
      },
      select: {
        notificationId: true,
      },
    })

    if (!exists) {
      throw new ApiError({
        status: 404,
        code: "NOTIFICATION_NOT_FOUND",
        message: "通知不存在",
      })
    }
  }

  return {
    ok: true,
  }
}

export async function markAllNotificationsRead(actor: ApiCurrentUser) {
  await prisma.notification.updateMany({
    where: {
      recipientUserId: actor.userId,
      isRead: false,
    },
    data: {
      isRead: true,
      readAt: new Date(),
    },
  })

  return {
    ok: true,
  }
}

async function listEditorRecentActivities(actor: ApiCurrentUser, limit: number) {
  const logs = await prisma.operationLog.findMany({
    where: {
      actorUserId: actor.userId,
      action: {
        in: ["doc.approve", "doc.return", "project.qc.unlock", "project.complete", "si_preissue.convert_to_project"],
      },
    },
    include: {
      doc: {
        select: {
          title: true,
        },
      },
      project: {
        select: {
          title: true,
        },
      },
      storyIdea: {
        select: {
          title: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  })

  return logs.map((log) => {
    if (log.action === "doc.approve") {
      return {
        title: log.doc?.title ?? log.project?.title ?? "Doc",
        action: "已通过",
        tone: "success" as const,
        time: log.createdAt.toISOString(),
      }
    }

    if (log.action === "doc.return") {
      return {
        title: log.doc?.title ?? log.project?.title ?? "Doc",
        action: "已退回",
        tone: "warning" as const,
        time: log.createdAt.toISOString(),
      }
    }

    if (log.action === "project.qc.unlock") {
      return {
        title: log.project?.title ?? "项目",
        action: "质检已解锁",
        tone: "info" as const,
        time: log.createdAt.toISOString(),
      }
    }

    if (log.action === "project.complete") {
      return {
        title: log.project?.title ?? "项目",
        action: "项目已完成",
        tone: "success" as const,
        time: log.createdAt.toISOString(),
      }
    }

    return {
      title: log.storyIdea?.title ?? log.project?.title ?? "SI",
      action: "已转项目",
      tone: "info" as const,
      time: log.createdAt.toISOString(),
    }
  })
}

async function listAuthorRecentSubmissions(actor: ApiCurrentUser, limit: number) {
  const logs = await prisma.operationLog.findMany({
    where: {
      actorUserId: actor.userId,
      action: "doc.submit",
    },
    include: {
      doc: {
        select: {
          title: true,
          status: true,
        },
      },
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  })

  return logs.map((log) => {
    const status = log.doc ? dbDocStatusToUiStatus(log.doc.status) : "submitted"
    const action =
      status === "approved" ? "已通过" : status === "returned" ? "退回待改" : status === "submitted" ? "已提交" : "草稿"

    return {
      title: log.doc?.title ?? "Doc",
      action,
      tone: statusToTone(status),
      time: log.createdAt.toISOString(),
    }
  })
}

async function getEditorDashboard(actor: ApiCurrentUser): Promise<EditorDashboardStats> {
  const [responsibleProjectTotal, pendingReviewDocTotal, returnedDocTotal, dueSoonProjectTotal, overdueProjectTotal, siDraftTotal, siPrereleasedTotal, recentActivities] =
    await Promise.all([
      prisma.project.count({
        where: {
          editorId: actor.userId,
          lifecycleStatus: "active",
        },
      }),
      prisma.doc.count({
        where: {
          isDeleted: false,
          status: "submitted",
          holderRole: "editor",
          project: {
            editorId: actor.userId,
          },
        },
      }),
      prisma.doc.count({
        where: {
          isDeleted: false,
          status: "rejected",
          project: {
            editorId: actor.userId,
          },
        },
      }),
      prisma.project.count({
        where: {
          editorId: actor.userId,
          stagePlans: {
            some: {
              timelineStatus: "due_soon",
            },
          },
        },
      }),
      prisma.project.count({
        where: {
          editorId: actor.userId,
          stagePlans: {
            some: {
              timelineStatus: "overdue",
            },
          },
        },
      }),
      prisma.storyIdea.count({
        where: {
          creatorEditorId: actor.userId,
          status: "draft",
        },
      }),
      prisma.storyIdea.count({
        where: {
          creatorEditorId: actor.userId,
          status: "preissued",
        },
      }),
      listEditorRecentActivities(actor, 6),
    ])

  return {
    responsibleProjectTotal,
    pendingReviewDocTotal,
    returnedDocTotal,
    dueSoonProjectTotal,
    overdueProjectTotal,
    siDraftTotal,
    siPrereleasedTotal,
    recentActivities,
  }
}

async function getAuthorDashboard(actor: ApiCurrentUser, range: RangeKey): Promise<AuthorDashboardStats> {
  const since = startDateByRange(range)
  const [projectTotal, draftDocTotal, returnedDocTotal, pendingSubmitDocTotal, recentSubmitCount, totalWordCountAgg, recentSubmissions] =
    await Promise.all([
      prisma.project.count({
        where: {
          authorId: actor.userId,
          lifecycleStatus: "active",
        },
      }),
      prisma.doc.count({
        where: {
          isDeleted: false,
          status: "draft",
          holderRole: "author",
          project: {
            authorId: actor.userId,
          },
        },
      }),
      prisma.doc.count({
        where: {
          isDeleted: false,
          status: "rejected",
          holderRole: "author",
          project: {
            authorId: actor.userId,
          },
        },
      }),
      prisma.doc.count({
        where: {
          isDeleted: false,
          holderRole: "author",
          status: {
            in: ["draft", "rejected"],
          },
          project: {
            authorId: actor.userId,
          },
        },
      }),
      prisma.operationLog.count({
        where: {
          actorUserId: actor.userId,
          action: "doc.submit",
          ...(since ? { createdAt: { gte: since } } : {}),
        },
      }),
      prisma.doc.aggregate({
        where: {
          isDeleted: false,
          project: {
            authorId: actor.userId,
          },
        },
        _sum: {
          currentWordCount: true,
        },
      }),
      listAuthorRecentSubmissions(actor, 6),
    ])

  return {
    projectTotal,
    draftDocTotal,
    returnedDocTotal,
    pendingSubmitDocTotal,
    recentSubmitCount,
    totalWordCount: totalWordCountAgg._sum.currentWordCount ?? 0,
    recentSubmissions,
  }
}

async function getEditorReport(actor: ApiCurrentUser): Promise<EditorReportStats> {
  const dashboard = await getEditorDashboard(actor)

  return {
    projectTotal: dashboard.responsibleProjectTotal,
    pendingReviewDocTotal: dashboard.pendingReviewDocTotal,
    returnedDocTotal: dashboard.returnedDocTotal,
    dueSoonProjectTotal: dashboard.dueSoonProjectTotal,
    overdueProjectTotal: dashboard.overdueProjectTotal,
    recentActivities: dashboard.recentActivities.map((item) => ({
      name: `${item.action} · ${item.title}`,
      value: item.time,
    })),
  }
}

async function getAuthorReport(actor: ApiCurrentUser, range: RangeKey): Promise<AuthorReportStats> {
  const dashboard = await getAuthorDashboard(actor, range)

  return {
    projectTotal: dashboard.projectTotal,
    draftOrReturnedDocTotal: dashboard.pendingSubmitDocTotal,
    returnedDocTotal: dashboard.returnedDocTotal,
    recentSubmitCount: dashboard.recentSubmitCount,
    totalWordCount: dashboard.totalWordCount,
    recentSubmissions: dashboard.recentSubmissions.map((item) => ({
      name: `${item.action} · ${item.title}`,
      value: item.time,
    })),
  }
}

export async function getWorkspaceDashboard(actor: ApiCurrentUser, range: RangeKey = "30d"): Promise<WorkspaceDashboardPayload> {
  if (actor.role === "admin") {
    return {
      role: "admin",
      stats: (await getAdminDashboard(actor, range)).stats,
    }
  }

  if (actor.role === "editor") {
    return {
      role: "editor",
      stats: await getEditorDashboard(actor),
    }
  }

  return {
    role: "author",
    stats: await getAuthorDashboard(actor, range),
  }
}

export async function getWorkspaceReport(actor: ApiCurrentUser, range: RangeKey = "30d"): Promise<WorkspaceReportPayload> {
  if (actor.role === "admin") {
    return {
      role: "admin",
      stats: (await getAdminReport(actor, range)).stats,
    }
  }

  if (actor.role === "editor") {
    return {
      role: "editor",
      stats: await getEditorReport(actor),
    }
  }

  return {
    role: "author",
    stats: await getAuthorReport(actor, range),
  }
}
