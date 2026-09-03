import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { mockCreateCommentReply, mockListCommentReplies, mockRequireApiCurrentUser } = vi.hoisted(() => ({
  mockCreateCommentReply: vi.fn(),
  mockListCommentReplies: vi.fn(),
  mockRequireApiCurrentUser: vi.fn(),
}))

vi.mock("@/server/modules/doc/comment-reply.service", () => ({
  createCommentReply: mockCreateCommentReply,
  listCommentReplies: mockListCommentReplies,
}))

vi.mock("@/server/shared/current-user", () => ({
  requireApiCurrentUser: mockRequireApiCurrentUser,
}))

import { GET, POST } from "@/app/api/docs/[docId]/comments/[commentId]/replies/route"

const actor = {
  id: "200",
  userId: 200n,
  username: "author",
  name: "作者",
  role: "author",
  status: "active",
  preferredLocale: "zh-CN",
  email: "author@example.test",
}
const context = { params: Promise.resolve({ docId: "10", commentId: "comment-1" }) }

describe("批注回复接口", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiCurrentUser.mockResolvedValue(actor)
  })

  it("GET 返回批注状态和按服务层顺序排列的历史回复", async () => {
    mockListCommentReplies.mockResolvedValue({
      commentId: "comment-1",
      commentActive: false,
      replies: [{ id: "30", content: "历史回复" }],
    })
    const request = new NextRequest("https://example.test/api/docs/10/comments/comment-1/replies")

    const response = await GET(request, context)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockListCommentReplies).toHaveBeenCalledWith(actor, "10", "comment-1")
    expect(payload).toMatchObject({
      ok: true,
      commentId: "comment-1",
      commentActive: false,
      replies: [{ id: "30", content: "历史回复" }],
    })
  })

  it("POST 校验纯文字长度并以 201 返回新回复", async () => {
    mockCreateCommentReply.mockResolvedValue({
      commentId: "comment-1",
      commentActive: true,
      reply: { id: "31", content: "已修改" },
    })
    const request = new NextRequest("https://example.test/api/docs/10/comments/comment-1/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "  已修改  " }),
    })

    const response = await POST(request, context)
    const payload = await response.json()

    expect(response.status).toBe(201)
    expect(mockCreateCommentReply).toHaveBeenCalledWith(actor, "10", "comment-1", { content: "已修改" })
    expect(payload).toMatchObject({ ok: true, reply: { id: "31", content: "已修改" } })

    mockCreateCommentReply.mockClear()
    const invalidRequest = new NextRequest("https://example.test/api/docs/10/comments/comment-1/replies", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: "" }),
    })
    const invalidResponse = await POST(invalidRequest, context)

    expect(invalidResponse.status).toBe(400)
    expect(await invalidResponse.json()).toMatchObject({ ok: false, code: "VALIDATION_ERROR" })
    expect(mockCreateCommentReply).not.toHaveBeenCalled()
  })
})
