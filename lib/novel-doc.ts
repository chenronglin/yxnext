export type NovelDocType = "synopsis" | "outline" | "chapter" | "release"

export type NovelActorRole = "author" | "editor" | "admin" | "ai"

export type NovelRevisionKind = "insert" | "delete" | "replace"

export type NovelRevisionRole = "inserted" | "deleted" | "original"

export type NovelSuggestionPosition = "before" | "after"

export type NovelSuggestionCategory =
  | "structure"
  | "logic"
  | "rhythm"
  | "expression"
  | "plot"
  | "character"
  | "worldbuilding"
  | "continuity"
  | "other"

export interface NovelCreatedBy {
  userId: string
  role: NovelActorRole
  nameSnapshot: string
}

export interface NovelDocAttrs {
  schemaVersion: 1
  docId: string
  docType: NovelDocType
  title: string | null
  createdAt: string
  updatedAt: string
}

export interface NovelTextNode {
  type: "text"
  text: string
  marks?: NovelMarkJson[]
}

export interface NovelBlockNode {
  type: string
  attrs?: Record<string, unknown>
  content?: NovelContentNode[]
}

export type NovelContentNode = NovelTextNode | NovelBlockNode

export interface NovelDocJson {
  type: "doc"
  attrs: NovelDocAttrs
  content: NovelBlockNode[]
}

export interface NovelDocProjection {
  contentJson: NovelDocJson
  plainText: string
  cleanText: string
  exportText: string
  summary: string | null
  wordCount: number
  commentCount: number
  suggestionCount: number
  revisionMarkCount: number
}

export type NovelMarkJson = {
  type: string
  attrs?: Record<string, unknown>
}

type CreateNovelDocInput = {
  docId: string | number | bigint
  docType: NovelDocType
  title: string | null
  createdAt?: string | Date | null
  updatedAt?: string | Date | null
  content?: NovelBlockNode[]
}

type ParagraphInput = {
  text: string
  id?: string
}

type HeadingInput = {
  text: string
  level?: 1 | 2 | 3
  id?: string
}

const NOVEL_DOC_TYPES: NovelDocType[] = ["synopsis", "outline", "chapter", "release"]

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

export function isNovelTextNode(value: NovelContentNode): value is NovelTextNode {
  return value.type === "text" && "text" in value && typeof value.text === "string"
}

function isNovelDocType(value: unknown): value is NovelDocType {
  return typeof value === "string" && NOVEL_DOC_TYPES.includes(value as NovelDocType)
}

function isIsoLike(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

function toIsoString(value: string | Date | null | undefined) {
  if (value instanceof Date) {
    return value.toISOString()
  }

  if (typeof value === "string" && value.trim()) {
    return value
  }

  return new Date().toISOString()
}

function randomIdPart() {
  // 浏览器和 Node 24 都提供 crypto.randomUUID；测试或极端旧环境下再退回随机串。
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID().replace(/-/g, "")
  }

  return `${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`
}

export function createPrefixedId(prefix: string) {
  return `${prefix}_${randomIdPart()}`
}

export function createNovelDocId(docId: string | number | bigint) {
  const raw = String(docId)

  return raw.startsWith("doc_") ? raw : `doc_${raw}`
}

export function createNovelBlockId(kind: "p" | "h" | "suggestion" = "p") {
  return createPrefixedId(`block_${kind}`)
}

export function createNovelParagraph(input: ParagraphInput): NovelBlockNode {
  return {
    type: "paragraph",
    attrs: {
      id: input.id ?? createNovelBlockId("p"),
    },
    content: input.text ? [{ type: "text", text: input.text }] : [],
  }
}

export function createNovelHeading(input: HeadingInput): NovelBlockNode {
  return {
    type: "heading",
    attrs: {
      id: input.id ?? createNovelBlockId("h"),
      level: input.level ?? 1,
    },
    content: input.text ? [{ type: "text", text: input.text }] : [],
  }
}

export function textToNovelParagraphs(text: string | null | undefined) {
  // 文本导入只按空行拆段，避免后端生成阶段依赖前端富文本命令。
  return (text ?? "")
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map((segment) => createNovelParagraph({ text: segment }))
}

export function createNovelDocV1(input: CreateNovelDocInput): NovelDocJson {
  const createdAt = toIsoString(input.createdAt)

  return {
    type: "doc",
    attrs: {
      schemaVersion: 1,
      docId: createNovelDocId(input.docId),
      docType: input.docType,
      title: input.title,
      createdAt,
      updatedAt: toIsoString(input.updatedAt ?? createdAt),
    },
    content: input.content ?? [],
  }
}

export function isNovelDocV1(value: unknown): value is NovelDocJson {
  if (!isRecord(value) || value.type !== "doc" || !isRecord(value.attrs)) {
    return false
  }

  const attrs = value.attrs

  return (
    attrs.schemaVersion === 1 &&
    typeof attrs.docId === "string" &&
    attrs.docId.startsWith("doc_") &&
    isNovelDocType(attrs.docType) &&
    (typeof attrs.title === "string" || attrs.title === null) &&
    isIsoLike(attrs.createdAt) &&
    isIsoLike(attrs.updatedAt) &&
    Array.isArray(value.content)
  )
}

export function assertNovelDocV1(value: unknown): asserts value is NovelDocJson {
  if (!isNovelDocV1(value)) {
    throw new Error("contentJson 必须是 Novel Editor Tiptap JSON v1")
  }
}

function isNovelTextBlock(block: NovelBlockNode) {
  // 只有顶层段落和标题会被批注、修订与编辑建议作为正文锚点引用。
  // editSuggestion 等其它块拥有自己的业务 id，不能混入正文 block id 的去重范围。
  return block.type === "paragraph" || block.type === "heading"
}

function isUsableNovelBlockId(value: unknown): value is string {
  // 历史数据可能把 id 保存成 null、数字或空白字符串；这些值都不能作为稳定的正文锚点。
  // 对非空字符串保留原值而不强制改写前缀，以兼容已经落库的合法自定义 id。
  return typeof value === "string" && value.trim().length > 0
}

function createUniqueNovelBlockId(kind: "p" | "h", unavailableIds: Set<string>) {
  const generatedBase = createNovelBlockId(kind)
  let candidate = generatedBase
  let suffix = 1

  // UUID 正常情况下不会碰撞；仍在数据层做确定性兜底，保证生成结果不会覆盖任何已有合法 id。
  // 若测试环境或极端运行环境返回了重复随机值，则递增后缀直到找到真正可用的 id。
  while (unavailableIds.has(candidate)) {
    candidate = `${generatedBase}_${suffix}`
    suffix += 1
  }

  unavailableIds.add(candidate)
  return candidate
}

function cloneBlockWithNormalizedId(
  block: NovelBlockNode,
  unavailableIds: Set<string>,
  retainedOriginalIds: Set<string>,
) {
  const attrs = isRecord(block.attrs) ? { ...block.attrs } : {}

  if (isNovelTextBlock(block)) {
    const originalId = attrs.id

    if (isUsableNovelBlockId(originalId) && !retainedOriginalIds.has(originalId)) {
      // 第一次出现的非空字符串 id 保持原样；这样已唯一的合法 id 不会因规范化而失去引用稳定性。
      // 对重复 id 也保留第一次出现者，后续重复项会在下方获得与块类型匹配的新 id。
      retainedOriginalIds.add(originalId)
    } else {
      attrs.id = createUniqueNovelBlockId(block.type === "heading" ? "h" : "p", unavailableIds)
    }
  }

  return {
    ...block,
    attrs,
  }
}

function shouldDropTextForCleanExport(marks: NovelMarkJson[]) {
  return marks.some(
    (mark) =>
      mark.type === "revision" &&
      (mark.attrs?.role === "deleted" || mark.attrs?.role === "original"),
  )
}

function removeCollaborationMarks(marks: NovelMarkJson[]) {
  const cleanMarks = marks.filter((mark) => mark.type !== "comment" && mark.type !== "revision")

  return cleanMarks.length > 0 ? cleanMarks : undefined
}

function cleanInlineContentForExport(content: NovelContentNode[] | undefined): NovelContentNode[] {
  const result: NovelContentNode[] = []

  for (const child of content ?? []) {
    if (!isRecord(child)) {
      continue
    }

    const node = child as NovelContentNode

    if (isNovelTextNode(node)) {
      const marks = (Array.isArray(child.marks) ? child.marks : []).filter(
        (mark): mark is NovelMarkJson => isRecord(mark) && typeof mark.type === "string",
      )

      if (shouldDropTextForCleanExport(marks)) {
        continue
      }

      result.push({
        ...node,
        marks: removeCollaborationMarks(marks),
      })
      continue
    }

    result.push({
      ...node,
      content: cleanInlineContentForExport(Array.isArray(node.content) ? node.content : []),
    })
  }

  return result
}

export function extractCleanNovelDocBlocks(doc: NovelDocJson): NovelBlockNode[] {
  // 富文本导出使用正文 JSON 作为格式来源，但批注、修订和编辑建议属于协作层语义，不能进入交付稿。
  // 这里保留段落、标题和普通文字格式；删除态修订与替换前原文会被过滤，插入态文字则作为清稿正文保留。
  return doc.content
    .filter((block) => block.type !== "editSuggestion")
    .map((block) => ({
      ...block,
      content: cleanInlineContentForExport(block.content),
    }))
}

export function ensureNovelBlockIds(doc: NovelDocJson): NovelDocJson {
  // 先预留全部顶层段落和标题已有的合法 id，避免为前面的坏数据生成 id 时，
  // 意外占用后面本来唯一且合法的 id；这是保证合法 id 稳定不变的关键。
  const unavailableIds = new Set<string>()

  for (const block of doc.content) {
    if (isNovelTextBlock(block) && isUsableNovelBlockId(block.attrs?.id)) {
      unavailableIds.add(block.attrs.id)
    }
  }

  // Tiptap 插件仍会在交互时补齐 block id；这里作为保存、投影和后端路径的统一数据层兜底：
  // 修复缺失、空白和重复 id，同时只处理顶层 paragraph/heading，不改写其它业务节点的 id。
  const retainedOriginalIds = new Set<string>()

  return {
    ...doc,
    content: doc.content.map((block) =>
      cloneBlockWithNormalizedId(block, unavailableIds, retainedOriginalIds),
    ),
  }
}

export function stampNovelDocUpdatedAt(doc: NovelDocJson, updatedAt: string | Date = new Date()): NovelDocJson {
  return {
    ...doc,
    attrs: {
      ...doc.attrs,
      updatedAt: toIsoString(updatedAt),
    },
  }
}

function textFromInlineContent(content: NovelContentNode[] | undefined, mode: "plain" | "clean", counter: ProjectionCounter) {
  let result = ""

  for (const child of content ?? []) {
    if (!isRecord(child)) {
      continue
    }

    if (child.type === "text") {
      const text = typeof child.text === "string" ? child.text : ""
      const marks = (Array.isArray(child.marks) ? child.marks : []).filter(
        (mark): mark is NovelMarkJson => isRecord(mark) && typeof mark.type === "string",
      )
      const revisionMarks = marks.filter((mark): mark is NovelMarkJson => isRecord(mark) && mark.type === "revision")

      collectMarks(marks, counter)

      if (mode === "clean" && revisionMarks.some((mark) => mark.attrs?.role === "deleted" || mark.attrs?.role === "original")) {
        continue
      }

      result += text
      continue
    }

    result += textFromInlineContent(Array.isArray(child.content) ? child.content : [], mode, counter)
  }

  return result
}

function blockText(block: NovelBlockNode, mode: "plain" | "clean", counter: ProjectionCounter) {
  if (block.type === "editSuggestion") {
    const id = isRecord(block.attrs) && typeof block.attrs.id === "string" ? block.attrs.id : createPrefixedId("suggestion")

    counter.suggestionIds.add(id)
    return ""
  }

  return textFromInlineContent(block.content, mode, counter).trim()
}

type ProjectionCounter = {
  commentIds: Set<string>
  suggestionIds: Set<string>
  revisionIds: Set<string>
}

function collectMarks(marks: NovelMarkJson[], counter: ProjectionCounter) {
  for (const mark of marks) {
    if (!isRecord(mark) || !isRecord(mark.attrs)) {
      continue
    }

    const id = typeof mark.attrs.id === "string" ? mark.attrs.id : null

    if (mark.type === "comment" && id) {
      counter.commentIds.add(id)
    }

    if (mark.type === "revision" && id) {
      counter.revisionIds.add(id)
    }
  }
}

function joinBlocks(doc: NovelDocJson, mode: "plain" | "clean", counter: ProjectionCounter) {
  return doc.content
    .map((block) => blockText(block, mode, counter))
    .filter(Boolean)
    .join("\n\n")
}

export function countChineseStyleWords(text: string) {
  return text.replace(/\s/g, "").length
}

export function deriveNovelDocProjection(input: NovelDocJson): NovelDocProjection {
  const contentJson = ensureNovelBlockIds(input)
  const counter: ProjectionCounter = {
    commentIds: new Set(),
    suggestionIds: new Set(),
    revisionIds: new Set(),
  }
  const plainText = joinBlocks(contentJson, "plain", counter)
  const cleanText = joinBlocks(contentJson, "clean", counter)

  return {
    contentJson,
    plainText,
    cleanText,
    exportText: cleanText,
    summary: cleanText.slice(0, 120) || null,
    wordCount: countChineseStyleWords(cleanText),
    commentCount: counter.commentIds.size,
    suggestionCount: counter.suggestionIds.size,
    revisionMarkCount: counter.revisionIds.size,
  }
}
