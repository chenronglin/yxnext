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
import { listTodos, markAllTodosRead } from "@/server/modules/workbench/workbench.service"

const actor: ApiCurrentUser = {
  id: "1",
  userId: 1n,
  username: "editor_a",
  name: "编辑甲",
  role: "editor",
  status: "active",
  email: "editor@example.com",
}

describe("workbench.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.todoItem.updateMany.mockResolvedValue({ count: 2 })
    mockPrisma.todoItem.findMany.mockResolvedValue([])
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

    const result = await listTodos(actor)

    expect(result.items).toEqual([
      expect.objectContaining({
        type: "review",
        read: false,
        readAt: null,
        href: "/review?docId=88",
      }),
    ])
  })
})
