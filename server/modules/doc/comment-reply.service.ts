import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { DocCommentRepliesResponse, DocCommentReplyItem } from "@/types/doc"

const MAX_REPLY_LENGTH = 2_000
const MAX_COMMENT_ID_LENGTH = 191

type CommentMarkMatch = {
  id: string
  creatorRole: string
}

function parseBigIntId(value: string, label: string) {
  if (!/^\d+$/.test(value)) {
    throw new ApiError({ status: 400, code: "INVALID_ID", message: `${label} 必须是数字 ID` })
  }
  return BigInt(value)
}

function normalizeCommentId(value: string) {
  const commentId = value.trim()

  if (!commentId || commentId.length > MAX_COMMENT_ID_LENGTH) {
    throw new ApiError({
      status: 400,
      code: "COMMENT_ID_INVALID",
      message: "批注 ID 不正确",
    })
  }

  return commentId
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

/**
 * Novel Doc JSON 中同一批注会出现在多个文本节点上；找到任一匹配 mark 即可判断锚点仍有效。
 */
export function findCommentMark(value: Prisma.JsonValue, commentId: string): CommentMarkMatch | null {
  if (!value || typeof value !== "object") {
    return null
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      const match = findCommentMark(item, commentId)
      if (match) return match
    }
    return null
  }

  const record = value as Prisma.JsonObject
  const marks = record.marks

  if (Array.isArray(marks)) {
    for (const mark of marks) {
      if (!mark || typeof mark !== "object" || Array.isArray(mark)) continue
      const markRecord = mark as Prisma.JsonObject
      const attrs = markRecord.attrs

      if (markRecord.type !== "comment" || !attrs || typeof attrs !== "object" || Array.isArray(attrs)) continue
      const attrRecord = attrs as Prisma.JsonObject

      if (attrRecord.id !== commentId) continue
      const createdBy = attrRecord.createdBy
      const creatorRole =
        createdBy && typeof createdBy === "object" && !Array.isArray(createdBy)
          ? String((createdBy as Prisma.JsonObject).role ?? "")
          : ""

      return { id: commentId, creatorRole }
    }
  }

  for (const nested of Object.values(record)) {
    if (nested === undefined) continue
    const match = findCommentMark(nested, commentId)
    if (match) return match
  }

  return null
}

function makeDocVisibilityWhere(actor: ApiCurrentUser, docId: bigint): Prisma.DocWhereInput {
  return {
    docId,
    isDeleted: false,
    ...(actor.role === "admin"
      ? {}
      : actor.role === "editor"
        ? { project: { editorId: actor.userId } }
        : { project: { authorId: actor.userId } }),
  }
}

const replyInclude = {
  replyAuthor: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
} satisfies Prisma.DocCommentReplyInclude

function toReplyItem(reply: Prisma.DocCommentReplyGetPayload<{ include: typeof replyInclude }>): DocCommentReplyItem {
  return {
    id: reply.replyId.toString(),
    commentId: reply.commentId,
    content: reply.content,
    authorId: reply.replyAuthorId.toString(),
    authorName: userName(reply.replyAuthor),
    createdAt: reply.createdAt.toISOString(),
  }
}

async function findVisibleDoc(actor: ApiCurrentUser, docId: bigint) {
  const doc = await prisma.doc.findFirst({
    where: makeDocVisibilityWhere(actor, docId),
    include: {
      project: {
        select: {
          authorId: true,
          editorId: true,
          lifecycleStatus: true,
        },
      },
      activeDraft: {
        select: {
          status: true,
          contentJson: true,
        },
      },
    },
  })

  if (!doc) {
    throw new ApiError({
      status: 404,
      code: "DOC_NOT_FOUND",
      message: "稿件不存在或无权访问",
    })
  }

  return doc
}

function activeEditorComment(doc: Awaited<ReturnType<typeof findVisibleDoc>>, commentId: string) {
  if (!doc.activeDraft || doc.activeDraft.status !== "active") {
    return false
  }

  return findCommentMark(doc.activeDraft.contentJson, commentId)?.creatorRole === "editor"
}

export async function listCommentReplies(
  actor: ApiCurrentUser,
  docIdValue: string,
  commentIdValue: string,
): Promise<DocCommentRepliesResponse> {
  const docId = parseBigIntId(docIdValue, "稿件 ID")
  const commentId = normalizeCommentId(commentIdValue)
  const [doc, replies] = await Promise.all([
    findVisibleDoc(actor, docId),
    prisma.docCommentReply.findMany({
      where: { docId, commentId },
      include: replyInclude,
      orderBy: [{ createdAt: "asc" }, { replyId: "asc" }],
    }),
  ])

  return {
    commentId,
    commentActive: activeEditorComment(doc, commentId),
    replies: replies.map(toReplyItem),
  }
}

export async function createCommentReply(
  actor: ApiCurrentUser,
  docIdValue: string,
  commentIdValue: string,
  input: { content: string },
) {
  const docId = parseBigIntId(docIdValue, "稿件 ID")
  const commentId = normalizeCommentId(commentIdValue)
  const content = input.content.trim()

  if (!content || content.length > MAX_REPLY_LENGTH) {
    throw new ApiError({
      status: 400,
      code: "COMMENT_REPLY_CONTENT_INVALID",
      message: `回复内容须为 1 到 ${MAX_REPLY_LENGTH} 个字符`,
    })
  }

  const reply = await prisma.$transaction(async (tx) => {
    const doc = await tx.doc.findFirst({
      where: makeDocVisibilityWhere(actor, docId),
      include: {
        project: {
          select: {
            authorId: true,
            editorId: true,
            lifecycleStatus: true,
          },
        },
        activeDraft: {
          select: {
            status: true,
            contentJson: true,
          },
        },
      },
    })

    if (!doc) {
      throw new ApiError({ status: 404, code: "DOC_NOT_FOUND", message: "稿件不存在或无权访问" })
    }

    if (actor.role !== "author" || actor.userId !== doc.project.authorId) {
      throw new ApiError({
        status: 403,
        code: "COMMENT_REPLY_AUTHOR_ONLY",
        message: "只有项目作者可以回复编辑批注",
      })
    }

    if (doc.project.lifecycleStatus !== "active") {
      throw new ApiError({
        status: 409,
        code: "PROJECT_READ_ONLY",
        message: "当前项目不是进行中状态，不能新增回复",
      })
    }

    if (!activeEditorComment(doc, commentId)) {
      throw new ApiError({
        status: 409,
        code: "COMMENT_INVALID",
        message: "原批注已失效或不是编辑批注，不能继续回复",
      })
    }

    const created = await tx.docCommentReply.create({
      data: {
        docId,
        commentId,
        replyAuthorId: actor.userId,
        content,
      },
      include: replyInclude,
    })

    // 回复独立落表并写审计，不更新稿件 JSON、草稿锁版本或 Revision。
    await tx.operationLog.create({
      data: {
        actorUserId: actor.userId,
        actorRole: actor.role,
        action: "doc.comment.reply.create",
        entityType: "doc_comment_reply",
        entityId: created.replyId,
        projectId: doc.projectId,
        docId,
        afterJson: {
          commentId,
          replyId: created.replyId.toString(),
          content,
        },
      },
    })

    return created
  })

  return {
    commentId,
    commentActive: true,
    reply: toReplyItem(reply),
  }
}
