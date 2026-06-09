import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    user: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
    todoItem: {
      createMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  const prisma = {
    user: {
      findFirst: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    mockTx: tx,
    mockPrisma: prisma,
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { registerPendingUser, requestPasswordResetByEmail } from "@/server/modules/auth/auth.service"

describe("auth.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx))
    mockPrisma.user.findFirst.mockResolvedValue(null)
    mockTx.user.findMany.mockResolvedValue([{ userId: 1n }, { userId: 2n }])
    mockTx.user.create.mockResolvedValue({
      userId: 100n,
      username: "writer_a",
      displayName: "作者甲",
      role: "author",
      status: "pending",
    })
    mockTx.notification.createMany.mockResolvedValue({ count: 2 })
    mockTx.todoItem.createMany.mockResolvedValue({ count: 2 })
    mockTx.operationLog.create.mockResolvedValue(undefined)
  })

  it("邮箱注册申请会写入 biography，并给全部管理员创建通知和审批待办", async () => {
    const result = await registerPendingUser({
      username: "writer_a",
      name: "作者甲",
      role: "author",
      email: "writer@example.com",
      biography: "擅长都市奇幻",
      password: "secret123",
    })

    expect(result).toEqual({
      userId: "100",
      status: "pending",
    })

    expect(mockTx.user.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          email: "writer@example.com",
          biography: "擅长都市奇幻",
          status: "pending",
        }),
      }),
    )
    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1)
    expect(mockTx.todoItem.createMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.arrayContaining([
          expect.objectContaining({
            todoType: "register_approval",
            isRead: false,
            readAt: null,
          }),
        ]),
      }),
    )
  })

  it("忘记密码请求始终返回统一成功结果，用户存在时只通知管理员不创建待办", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce({
      userId: 200n,
      username: "writer_a",
      displayName: "作者甲",
    })

    const result = await requestPasswordResetByEmail("writer@example.com")

    expect(result).toEqual({ ok: true })
    expect(mockTx.notification.createMany).toHaveBeenCalledTimes(1)
    expect(mockTx.todoItem.createMany).not.toHaveBeenCalled()
  })

  it("忘记密码请求在邮箱不存在时也返回统一成功结果，且不会发通知", async () => {
    mockPrisma.user.findFirst.mockResolvedValueOnce(null)

    const result = await requestPasswordResetByEmail("missing@example.com")

    expect(result).toEqual({ ok: true })
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockTx.notification.createMany).not.toHaveBeenCalled()
  })
})
