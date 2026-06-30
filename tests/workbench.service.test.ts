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

  it("待审待办会把作者提交说明渲染到详情", async () => {
    mockPrisma.todoItem.findMany.mockResolvedValueOnce([
      {
        todoId: 13n,
        recipientUserId: actor.userId,
        todoType: "doc_review",
        messageKey: "todos.review",
        messageParams: {
          projectTitle: "测试项目",
          docTitle: "第一章",
        },
        title: "Doc 待审：第一章",
        description: "旧中文 fallback",
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
          lastHandoffNote: "请老师重点看节奏",
        },
      },
    ])

    const result = await listTodos(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Doc 待审：第一章",
        detail: "作者已提交《测试项目》的 第一章，请进入审核。提交说明：请老师重点看节奏",
      }),
    )
  })

  it("退回待办会把编辑填写的退回原因渲染到详情", async () => {
    // 这个用例覆盖作者截图里的入口：旧待办缺少 returnNote 参数时，仍要从 Doc.lastHandoffNote 兜底展示原因。
    mockPrisma.todoItem.findMany.mockResolvedValueOnce([
      {
        todoId: 12n,
        recipientUserId: actor.userId,
        todoType: "doc_return",
        messageKey: "todos.return",
        messageParams: {
          projectTitle: "测试项目",
          docTitle: "第一章",
        },
        title: "Doc 待改：第一章",
        description: "旧中文 fallback",
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
          lastHandoffNote: "请补强中段冲突",
        },
      },
    ])

    const result = await listTodos(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Doc 待改：第一章",
        detail: "编辑已退回《测试项目》的 第一章，请根据意见修改后重新提交。退回原因：请补强中段冲突",
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

  it("退回通知会把编辑填写的退回原因渲染到详情", async () => {
    // 通知中心和待办页走两张表；旧通知同样要能从关联 Doc 兜底补回退回原因。
    mockPrisma.notification.findMany.mockResolvedValueOnce([
      {
        notificationId: 21n,
        type: "doc_returned",
        messageKey: "notifications.docReturn",
        messageParams: {
          projectTitle: "测试项目",
          docTitle: "第一章",
        },
        title: "Doc 已退回待改",
        body: "旧中文 fallback",
        projectId: 99n,
        docId: 88n,
        siId: null,
        preissueId: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        doc: {
          lastHandoffNote: "请补强中段冲突",
        },
      },
    ])

    const result = await listNotifications(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Doc 已退回待改",
        detail: "编辑已退回《测试项目》的 第一章，请根据意见修改后重新提交。退回原因：请补强中段冲突",
      }),
    )
  })

  it("提交通知会把作者提交说明渲染到详情", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([
      {
        notificationId: 22n,
        type: "doc_submitted_for_review",
        messageKey: "notifications.docSubmit",
        messageParams: {
          projectTitle: "测试项目",
          docTitle: "第一章",
        },
        title: "Doc 已提交待审",
        body: "旧中文 fallback",
        projectId: 99n,
        docId: 88n,
        siId: null,
        preissueId: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        doc: {
          lastHandoffNote: "请老师重点看节奏",
        },
      },
    ])

    const result = await listNotifications(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Doc 已提交待审",
        detail: "作者已提交《测试项目》的 第一章，请及时审核。提交说明：请老师重点看节奏",
      }),
    )
  })

  it("审核通过通知会把编辑审核说明渲染到详情", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([
      {
        notificationId: 23n,
        type: "doc_approved",
        messageKey: "notifications.docApprove",
        messageParams: {
          projectTitle: "测试项目",
          docTitle: "第一章",
        },
        title: "Doc 审核通过",
        body: "旧中文 fallback",
        projectId: 99n,
        docId: 88n,
        siId: null,
        preissueId: null,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        doc: {
          lastHandoffNote: "通过，保持这个节奏",
        },
      },
    ])

    const result = await listNotifications(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "Doc 审核通过",
        detail: "《测试项目》的 第一章 已审核通过。审核说明：通过，保持这个节奏",
      }),
    )
  })

  it("SI 预发通知会把编辑预发说明渲染到详情", async () => {
    mockPrisma.notification.findMany.mockResolvedValueOnce([
      {
        notificationId: 24n,
        type: "si_preissued",
        messageKey: "notifications.siPrerelease",
        messageParams: {
          siTitle: "测试选题",
        },
        title: "收到新的 SI 预发",
        body: "旧中文 fallback",
        projectId: null,
        docId: null,
        siId: 66n,
        preissueId: 77n,
        createdAt: new Date("2026-06-09T10:00:00.000Z"),
        isRead: false,
        preissue: {
          preissueNote: "适合都市悬疑作者试写",
        },
      },
    ])

    const result = await listNotifications(actor, "zh-CN")

    expect(result.items[0]).toEqual(
      expect.objectContaining({
        title: "收到新的 SI 预发",
        detail: "编辑向你预发了《测试选题》。预发说明：适合都市悬疑作者试写",
      }),
    )
  })
})
