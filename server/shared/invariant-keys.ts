import { Prisma } from "@prisma/client"

import { ApiError } from "@/server/shared/api-response"

function joinBigIntKey(parts: Array<bigint | number | string>) {
  return parts.map((part) => String(part)).join(":")
}

// 活动绑定唯一键：
// 同一作者在活动状态下只能绑定一个编辑，因此唯一键只能以作者为维度。
// 如果把 editorId 也拼进键里，并发场景会允许“同一作者绑定多个编辑”同时成立。
export function makeActiveBindingKey(editorId: bigint, authorId: bigint) {
  void editorId
  return String(authorId)
}

// 有效预发唯一键：
// 同一 SI 对同一作者在“未收回”的有效区间里只能保留一条记录。
export function makeEffectivePreissueKey(siId: bigint, authorId: bigint) {
  return joinBigIntKey([siId, authorId])
}

// 单阶段 Doc 唯一键：
// 梗概、细纲、质检这三类“项目内唯一 Doc”必须保证一项目一份。
export function makeSingleDocKey(projectId: bigint, docType: "synopsis" | "outline" | "release") {
  return joinBigIntKey([projectId, docType])
}

// 章节排序唯一键：
// 同一项目下的章节 Doc 在未删除状态时，排序值必须唯一。
export function makeChapterOrderKey(projectId: bigint, sortOrder: number) {
  return joinBigIntKey([projectId, sortOrder])
}

// 章节号唯一键：
// 章节号允许为空；一旦填写，同一项目下未删除章节不能重复使用同一个章节号。
export function makeChapterNoKey(projectId: bigint, chapterNo: number | null) {
  return chapterNo === null ? null : joinBigIntKey([projectId, chapterNo])
}

// 活动草稿唯一键：
// 同一 Doc 同一时刻只能挂一条 active CurrentDraft，因此直接复用 docId 作为唯一值即可。
export function makeActiveDocKey(docId: bigint) {
  return docId
}

type UniqueConstraintMapping = {
  constraintIncludes: string[]
  code: string
  message: string
}

function hasAllConstraintParts(target: unknown, expectedParts: string[]) {
  const normalizedTarget = Array.isArray(target) ? target.map(String) : typeof target === "string" ? [target] : []

  return expectedParts.every((part) => normalizedTarget.some((item) => item.includes(part)))
}

// 把底层唯一约束异常翻译成稳定业务错误，避免并发写入场景把 P2002 直接冒成 500。
export function translateUniqueConstraintError(error: unknown, mappings: UniqueConstraintMapping[]) {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== "P2002") {
    return null
  }

  const target = (error.meta as { target?: unknown } | undefined)?.target

  for (const mapping of mappings) {
    if (hasAllConstraintParts(target, mapping.constraintIncludes)) {
      return new ApiError({
        status: 409,
        code: mapping.code,
        message: mapping.message,
      })
    }
  }

  return new ApiError({
    status: 409,
    code: "UNIQUE_CONSTRAINT_CONFLICT",
    message: "数据已在其他操作中发生冲突，请刷新后重试",
  })
}
