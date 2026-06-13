import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma } = vi.hoisted(() => {
  const prisma = {
    siPreissue: {
      findMany: vi.fn(),
    },
  }

  return {
    mockPrisma: prisma,
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { listSiPreissues } from "@/server/modules/si/si.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const authorActor: ApiCurrentUser = {
  id: "200",
  userId: 200n,
  username: "author_a",
  name: "作者甲",
  role: "author",
  status: "active",
  email: "author@example.com",
}

describe("si.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.siPreissue.findMany.mockResolvedValue([])
  })

  it("作者列预发记录时不能用 authorId 参数覆盖本人归属过滤", async () => {
    await listSiPreissues(authorActor, {
      authorId: "999",
    })

    // 作者端 authorId 必须固定为当前登录用户，防止通过查询参数读取其他作者的预发记录。
    expect(mockPrisma.siPreissue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: 200n,
          status: {
            not: "recalled",
          },
        }),
      }),
    )
  })
})
