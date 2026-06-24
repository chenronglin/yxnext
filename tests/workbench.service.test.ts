import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      todoItem: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
      },
      notification: {
        findMany: vi.fn(),
        updateMany: vi.fn(),
        findFirst: vi.fn(),
      },
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

vi.mock("@/server/modules/admin/admin.service", () => ({
  getAdminDashboard: vi.fn(),
  getAdminReport: vi.fn(),
}))

import type { ApiCurrentUser } from "@/server/shared/current-user"
import { listNotifications, listTodos, markAllTodosRead } from "@/server/modules/workbench/workbench.service"

const actor: ApiCurrentUser = {
  id: "1",
  userId: 1n,
  username: "editor_a",
  name: "编辑甲",
  role: "editor",
  status: "active",
  preferredLocale: "zh-CN",
  email: "editor@example.com",
}

describe("workbench.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.todoItem.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.todoItem.findMany.mockResolvedValue([])
    mockPrisma.notification.findMany.mockResolvedValue([])
  })

  it("批量标记已读只更新 isRead/readAt，不改业务 status", async () => {
    await markAllTodosRead(actor)

    expect(mockPrisma.todoItem.updateMany).toHaveBeenCalledWith({
      where: {
        recipientUserId: actor.userId,
        status: "open",
        isRead: false,
      },
      data: {
        isRead: true,
        readAt: expect.any(Date),
      },
    })
  })

  it("待办列表返回独立的 read/readAt 字段，不再拼接临时任务", async () => {
    mockPrisma.todoItem.findMany.mockResolvedValueOnce([
      {
        todoId: 10n,
        recipientUserId: actor.userId,
        todoType: "doc_review",
        title: "章节待审",
        dueAt: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        readAt: null,
        project: {
          projectId: 99n,
          title: "测试项目",
          author: {
            userId: 2n,
            username: "author_a",
            displayName: "作者甲",
          },
          editor: {
            userId: actor.userId,
            username: actor.username,
            displayName: actor.name,
          },
        },
        doc: {
          docId: 88n,
          docType: "chapter",
          title: "第一章",
        },
      },
    ])

    const result = await listTodos(actor, "zh-CN")

    expect(result.items).toEqual([
      expect.objectContaining({
        type: "review",
        read: false,
        readAt: null,
        href: "/projects/99/docs/88",
      }),
    ])
  })

  it("待办列表会按英文渲染结构化系统消息，业务标题变量保持原样", async () => {
    mockPrisma.todoItem.findMany.mockResolvedValueOnce([
      {
        todoId: 11n,
        recipientUserId: actor.userId,
        todoType: "stage_overdue",
        messageKey: "todos.stage.overdue",
        messageParams: {
          projectTitle: "测试项目",
          stageCode: "outline",
        },
        title: "细纲阶段已逾期",
        dueAt: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        readAt: null,
        project: {
          projectId: 99n,
          title: "测试项目",
          author: {
            userId: 2n,
            username: "author_a",
            displayName: "作者甲",
          },
          editor: {
            userId: actor.userId,
            username: actor.username,
            displayName: actor.name,
          },
        },
        doc: null,
      },
    ])

    const result = await listTodos(actor, "en-US")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Detailed Outline stage overdue",
        relatedType: "Project Stage",
        relatedName: "测试项目",
        status: "Overdue",
        from: "System",
      }),
    )
  })

  it("通知列表会按英文渲染 messageKey，并保留项目标题变量原文", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([
      {
        notificationId: 20n,
        type: "stage_warning",
        messageKey: "notifications.stageWarning.dueSoon",
        messageParams: {
          projectTitle: "测试项目",
          stageCode: "synopsis",
          dueAt: "2026-06-30",
        },
        title: "梗概阶段即将到期",
        body: "旧中文 fallback",
        projectId: 99n,
        docId: null,
        siId: null,
        preissueId: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
      },
    ])

    const result = await listNotifications(actor, "en-US")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Synopsis stage due soon",
        detail: "The Synopsis stage of “测试项目” is due soon. Planned due date: 2026-06-30.",
      }),
    )
  })
})
