import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    doc: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    docCommentReply: {
      create: vi.fn(),
    },
    docRevision: {
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      doc: {
        findFirst: vi.fn(),
      },
      docCommentReply: {
        findMany: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import {
  createCommentReply,
  findCommentMark,
  listCommentReplies,
} from "@/server/modules/doc/comment-reply.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const authorActor: ApiCurrentUser = {
  id: "200",
  userId: 200n,
  username: "author",
  name: "作者",
  role: "author",
  status: "active",
  preferredLocale: "zh-CN",
  email: "author@example.test",
}

const editorActor: ApiCurrentUser = {
  ...authorActor,
  id: "100",
  userId: 100n,
  username: "editor",
  name: "编辑",
  role: "editor",
  email: "editor@example.test",
}

function makeContent(commentId = "comment-1", creatorRole = "editor") {
  return {
    type: "doc",
    content: [
      {
        type: "paragraph",
        content: [
          {
            type: "text",
            text: "带批注的正文",
            marks: [
              {
                type: "comment",
                attrs: {
                  id: commentId,
                  body: "请补充说明",
                  createdBy: { userId: editorActor.id, role: creatorRole, nameSnapshot: "编辑" },
                },
              },
            ],
          },
        ],
      },
    ],
  }
}

function makeDoc(contentJson: ReturnType<typeof makeContent> | Record<string, unknown> = makeContent()) {
  return {
    docId: 10n,
    projectId: 20n,
    project: {
      authorId: authorActor.userId,
      editorId: editorActor.userId,
      lifecycleStatus: "active",
    },
    activeDraft: {
      status: "active",
      contentJson,
    },
  }
}

describe("comment-reply.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTx.doc.findFirst.mockResolvedValue(makeDoc())
    mockPrisma.doc.findFirst.mockResolvedValue(makeDoc())
    mockPrisma.docCommentReply.findMany.mockResolvedValue([])
    mockTx.docCommentReply.create.mockResolvedValue({
      replyId: 30n,
      docId: 10n,
      commentId: "comment-1",
      replyAuthorId: authorActor.userId,
      content: "已按批注修改",
      createdAt: new Date("2026-09-02T08:00:00.000Z"),
      replyAuthor: {
        userId: authorActor.userId,
        username: authorActor.username,
        displayName: authorActor.name,
      },
    })
    mockTx.operationLog.create.mockResolvedValue({})
  })

  it("能在嵌套稿件 JSON 中识别编辑创建的有效批注", () => {
    expect(findCommentMark(makeContent(), "comment-1")).toEqual({
      id: "comment-1",
      creatorRole: "editor",
    })
  })

  it("作者回复独立落表并写审计，不更新稿件、锁版本或 Revision", async () => {
    const result = await createCommentReply(authorActor, "10", "comment-1", {
      content: "  已按批注修改  ",
    })

    expect(mockTx.docCommentReply.create).toHaveBeenCalledWith({
      data: {
        docId: 10n,
        commentId: "comment-1",
        replyAuthorId: authorActor.userId,
        content: "已按批注修改",
      },
      include: expect.any(Object),
    })
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "doc.comment.reply.create",
        entityType: "doc_comment_reply",
        entityId: 30n,
        projectId: 20n,
        docId: 10n,
      }),
    })
    expect(mockTx.doc.update).not.toHaveBeenCalled()
    expect(mockTx.docRevision.create).not.toHaveBeenCalled()
    expect(result.reply).toEqual(expect.objectContaining({ id: "30", content: "已按批注修改" }))
  })

  it("编辑不能代替作者新增回复", async () => {
    await expect(
      createCommentReply(editorActor, "10", "comment-1", { content: "编辑尝试回复" }),
    ).rejects.toMatchObject({ code: "COMMENT_REPLY_AUTHOR_ONLY" })

    expect(mockTx.docCommentReply.create).not.toHaveBeenCalled()
  })

  it("作者不能回复作者批注或已从当前稿件移除的批注", async () => {
    mockTx.doc.findFirst.mockResolvedValue(makeDoc(makeContent("comment-1", "author")))

    await expect(
      createCommentReply(authorActor, "10", "comment-1", { content: "无效回复" }),
    ).rejects.toMatchObject({ code: "COMMENT_INVALID" })

    mockTx.doc.findFirst.mockResolvedValue(makeDoc({ type: "doc", content: [] }))
    await expect(
      createCommentReply(authorActor, "10", "comment-1", { content: "失效后回复" }),
    ).rejects.toMatchObject({ code: "COMMENT_INVALID" })
  })

  it("批注失效后仍返回历史回复，但标记为不可继续回复", async () => {
    const createdAt = new Date("2026-09-01T08:00:00.000Z")
    mockPrisma.doc.findFirst.mockResolvedValue(makeDoc({ type: "doc", content: [] }))
    mockPrisma.docCommentReply.findMany.mockResolvedValue([
      {
        replyId: 31n,
        docId: 10n,
        commentId: "comment-1",
        replyAuthorId: authorActor.userId,
        content: "历史回复",
        createdAt,
        replyAuthor: {
          userId: authorActor.userId,
          username: authorActor.username,
          displayName: authorActor.name,
        },
      },
    ])

    const result = await listCommentReplies(authorActor, "10", "comment-1")

    expect(result.commentActive).toBe(false)
    expect(result.replies).toEqual([
      expect.objectContaining({ id: "31", content: "历史回复", createdAt: createdAt.toISOString() }),
    ])
  })
})
