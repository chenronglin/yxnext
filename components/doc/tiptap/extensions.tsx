"use client"

import { Extension, Mark, mergeAttributes, Node as TiptapNode, type Editor, type Extensions } from "@tiptap/core"
import CharacterCount from "@tiptap/extension-character-count"
import { Color } from "@tiptap/extension-color"
import Document from "@tiptap/extension-document"
import Heading from "@tiptap/extension-heading"
import Highlight from "@tiptap/extension-highlight"
import Paragraph from "@tiptap/extension-paragraph"
import Placeholder from "@tiptap/extension-placeholder"
import { TextStyle } from "@tiptap/extension-text-style"
import StarterKit from "@tiptap/starter-kit"
import { Fragment, Slice, type Mark as ProseMirrorMark, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, Selection as ProseMirrorSelection, TextSelection } from "@tiptap/pm/state"
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state"
import { dropPoint, Mapping } from "@tiptap/pm/transform"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import type { ReactNodeViewProps } from "@tiptap/react"
import { PencilLine, Save, Trash2 } from "lucide-react"
import { useEffect, useRef, useState } from "react"

import {
  createNovelBlockId,
  createPrefixedId,
  type NovelCreatedBy,
  type NovelRevisionKind,
  type NovelRevisionRole,
  type NovelSuggestionCategory,
  type NovelSuggestionPosition,
} from "@/lib/novel-doc"
import { cn } from "@/lib/utils"

type RevisionPluginState = {
  // 连续删除只允许复用上一笔“由本插件明确生成”的删除修订。
  // 保存完整 attrs 可以保证连续删除沿用同一 createdAt/createdBy，避免同一 revision id 出现多份审计快照。
  lastDeleteAttrs: RevisionAttributes | null
  continuationBoundary: number | null
  deleteDirection: RevisionDeleteDirection | null
}

type RevisionDeleteDirection = "backward" | "forward"

type RevisionPluginMeta = {
  id: string
  groupId: string
  kind: NovelRevisionKind
  role: NovelRevisionRole
  from: number
  to: number
  composition?: boolean
  // 删除方向和连续边界只服务于下一次 Backspace/Delete 的合并判断；其它事务必须清空它们。
  deleteDirection?: RevisionDeleteDirection
  continuationBoundary?: number
  revisionAttrs?: RevisionAttributes
  // composition 修改的对象如果本来就是 inserted，最终可能无需再产生文档 step；
  // 此标记让 React 适配层仍能发布最终稳定快照，而不是把最后一次有效编辑吞掉。
  forcePublish?: boolean
}

type TextRange = {
  from: number
  to: number
}

type CompositionBase = {
  // compositionstart 时的选区仅作为会话锚点；真实替换范围以后续 transaction StepMap 为准。
  selection: TextRange
  doc: ProseMirrorNode
  existingInsertedAttrs: RevisionAttributes | null
  // mapping 始终表示“会话开始文档 → 当前文档”，用于把后续输入、点击和光标位置安全映射到最新 state。
  mapping: Mapping
  // originalRange 使用会话开始文档坐标；insertedRange 使用当前文档坐标。
  // 两者都由原生 composition transaction 的 StepMap 聚合，不再通过全文长度猜测。
  originalRange: TextRange | null
  insertedRange: TextRange | null
  compositionId: number | string | null
}

type RevisionTrackingOptions = {
  enabled: boolean
  createdBy: NovelCreatedBy
}

type RevisionAttributes = {
  id: string
  groupId: string
  kind: NovelRevisionKind
  role: NovelRevisionRole
  createdBy: NovelCreatedBy
  createdAt: string
}

type CommentAttributes = {
  id: string
  kind: "normal" | "delete_hint" | "replace_hint" | "insert_hint"
  body: string
  createdBy: NovelCreatedBy
  createdAt: string
  updatedAt: string | null
}

type EditSuggestionAttrs = {
  id: string
  anchorBlockId: string
  position: NovelSuggestionPosition
  category: NovelSuggestionCategory
  body: string
  createdBy: NovelCreatedBy
  createdAt: string
  updatedAt: string | null
}

declare module "@tiptap/core" {
  interface Commands<ReturnType> {
    novelRevision: {
      markSelectionAsDeletedRevision: () => ReturnType
    }
  }
}

const revisionTrackingKey = new PluginKey<RevisionPluginState>("novel-revision-tracking")

const discussionHighlightKey = new PluginKey<{ activeId: string | null }>("novel-discussion-highlight")

type RevisionCompositionRuntime = {
  isComposing: () => boolean
  hasPendingFinalize: () => boolean
  // 除了 Mapping，还要返回“候选文本末尾”在 flush 前的坐标。
  // finalize 会恰好在该点后恢复 original，紧接着的输入必须粘在恢复内容之前，不能使用默认 assoc=1 越过去。
  flushPendingFinalize: (view: EditorView) => CompositionFinalizeResult | null
}

type CompositionFinalizeResult = {
  mapping: Mapping
  stickyBoundary: number | null
}

// composition 状态属于浏览器输入会话，不应写入 ProseMirror 文档或 JSON；
// 用 WeakMap 按 EditorView 暂存运行时句柄，方便 React 受控 value 回写前判断是否需要让 pending 补标先落地。
const revisionCompositionRuntimeByView = new WeakMap<EditorView, RevisionCompositionRuntime>()

function fallbackActor(): NovelCreatedBy {
  // 这个兜底只用于极端情况下防止 JSON 结构缺字段；正常路径会由 RoleProvider 注入当前用户快照。
  return {
    userId: "unknown",
    role: "editor",
    nameSnapshot: "未知用户",
  }
}

function clampPosition(state: EditorState, pos: number) {
  return Math.max(0, Math.min(pos, state.doc.content.size))
}

function normalizeRange(state: EditorState, from: number, to: number): TextRange {
  return {
    from: clampPosition(state, Math.min(from, to)),
    to: clampPosition(state, Math.max(from, to)),
  }
}

function rangeFromSelection(state: EditorState, selection: Selection): TextRange {
  return normalizeRange(state, selection.from, selection.to)
}

function rangeContainsText(state: EditorState, range: TextRange) {
  let hasText = false

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (node.isText && Boolean(node.text)) {
      hasText = true
      return false
    }

    return !hasText
  })

  return hasText
}

function rangePhysicallyRemovesComment(state: EditorState, range: TextRange) {
  let removesComment = false

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText) {
      return true
    }

    // 修订删除只会物理移除 inserted；普通底稿仅增加 deleted mark，已有批注锚点仍然存在。
    // 因此确认框必须同时满足“带批注”和“属于 inserted”，避免对不会丢批注的普通删改给出错误警告。
    removesComment =
      node.marks.some((mark) => mark.type.name === "comment") &&
      node.marks.some(isInsertedRevisionMark)
    return !removesComment
  })

  return removesComment
}

type RevisionTextSegmentKind = "plain" | "inserted" | "deleted" | "original"

type RevisionTextSegment = {
  from: number
  to: number
  kind: RevisionTextSegmentKind
}

function revisionTextSegmentKind(node: ProseMirrorNode): RevisionTextSegmentKind {
  const revision = node.marks.find(isRevisionMark)

  if (!revision) {
    return "plain"
  }

  if (revision.attrs.role === "inserted" && (revision.attrs.kind === "insert" || revision.attrs.kind === "replace")) {
    return "inserted"
  }

  if (revision.attrs.role === "original") {
    return "original"
  }

  return "deleted"
}

function collectRevisionTextSegments(state: EditorState, range: TextRange) {
  const segments: RevisionTextSegment[] = []

  state.doc.nodesBetween(range.from, range.to, (node, pos) => {
    if (!node.isText) {
      return true
    }

    const start = Math.max(range.from, pos)
    const end = Math.min(range.to, pos + node.nodeSize)

    if (start < end) {
      segments.push({
        from: start,
        to: end,
        kind: revisionTextSegmentKind(node),
      })
    }

    return true
  })

  return segments
}

type RestoredCompositionSlice = {
  slice: Slice
  // 只有没有 revision mark 的真实底稿文字才会被本次 composition 转换成 original/deleted；
  // 该标记用于区分“替换底稿”和“只改写历史修订展示层”。
  hasPlainText: boolean
}

function restoreCompositionNode(
  node: ProseMirrorNode,
  plainTextMark: ProseMirrorMark | null,
  result: { hasPlainText: boolean },
): ProseMirrorNode | null {
  if (node.isText) {
    if (node.marks.some(isInsertedRevisionMark)) {
      // inserted 从未属于底稿；被输入法替换后应物理消失，不能作为 original/deleted 恢复。
      return null
    }

    if (node.marks.some(isRevisionMark)) {
      // 已有 deleted/original 属于历史审计层。恢复时必须原样保留其 id/kind/role，
      // 不能再对整段 addMark，否则同类型 revision mark 会被当前替换修订覆盖。
      return node
    }

    result.hasPlainText = true

    // 普通正文才获得本次 replace/original 或 delete/deleted 身份；批注、加粗、颜色等普通 marks 继续保留。
    return plainTextMark ? node.mark(plainTextMark.addToSet(node.marks)) : node
  }

  if (node.isLeaf) {
    return node
  }

  const children: ProseMirrorNode[] = []
  node.content.forEach((child) => {
    const next = restoreCompositionNode(child, plainTextMark, result)

    if (next) {
      children.push(next)
    }
  })

  // 输入法替换时，原选区里已有 inserted 文本不属于真实底稿；
  // 过滤后若容器为空，直接丢弃该容器，避免后续恢复出空的修订块。
  if (children.length === 0 && node.content.size > 0) {
    return null
  }

  return node.copy(Fragment.fromArray(children))
}

function prepareRestoredCompositionSlice(
  slice: Slice,
  plainTextMark: ProseMirrorMark | null,
): RestoredCompositionSlice {
  const children: ProseMirrorNode[] = []
  const result = { hasPlainText: false }

  slice.content.forEach((node) => {
    const next = restoreCompositionNode(node, plainTextMark, result)

    if (next) {
      children.push(next)
    }
  })

  const content = Fragment.fromArray(children)

  if (content.size === 0) {
    // 跨段选区若全部由 inserted 组成，过滤后会得到空 Fragment。此时沿用原来的 openStart/openEnd
    // 会形成 size 为负数的非法 Slice，并让 Transaction.replace 在 ProseMirror 内部直接崩溃。
    return {
      slice: Slice.empty,
      hasPlainText: result.hasPlainText,
    }
  }

  const maximallyOpen = Slice.maxOpen(content)

  return {
    // 过滤可能移除最外层首/尾块，因此开放深度也要收缩到新 Fragment 真正支持的最大值。
    // 保留不超过原 Slice 的开放语义，既支持跨段恢复，又不会制造悬空 open depth。
    slice: new Slice(
      content,
      Math.min(slice.openStart, maximallyOpen.openStart),
      Math.min(slice.openEnd, maximallyOpen.openEnd),
    ),
    hasPlainText: result.hasPlainText,
  }
}

function getTypingMarks(state: EditorState) {
  // 用户输入时保留加粗、颜色等普通格式，但去掉旧 revision mark，避免新输入继承旧修订身份。
  const marks = state.storedMarks ?? state.selection.$from.marks()

  return marks.filter((mark) => mark.type.name !== "revision")
}

function isRevisionMark(mark: ProseMirrorMark): mark is ProseMirrorMark & { attrs: RevisionAttributes } {
  return mark.type.name === "revision"
}

function isInsertedRevisionMark(mark: ProseMirrorMark): mark is ProseMirrorMark & { attrs: RevisionAttributes } {
  return isRevisionMark(mark) && mark.attrs.role === "inserted" && (mark.attrs.kind === "insert" || mark.attrs.kind === "replace")
}

function isDeletedRevisionMark(mark: ProseMirrorMark): mark is ProseMirrorMark & { attrs: RevisionAttributes } {
  return isRevisionMark(mark) && mark.attrs.role === "deleted" && mark.attrs.kind === "delete"
}

function isHistoricalRevisionMark(mark: ProseMirrorMark) {
  return isDeletedRevisionMark(mark) || (isRevisionMark(mark) && mark.attrs.role === "original")
}

// Intl.Segmenter 按用户可见字素切分文本，能把 emoji、ZWJ 序列、变体选择符和组合音标视为一个删除单位。
// 极端旧浏览器没有 Segmenter 时再退回 Array.from 的 Unicode code point 切分，至少不会拆坏代理对。
const graphemeSegmenter = typeof Intl.Segmenter === "function" ? new Intl.Segmenter("zh-CN", { granularity: "grapheme" }) : null

function firstGraphemeLength(text: string) {
  if (!text) {
    return 0
  }

  if (graphemeSegmenter) {
    const first = graphemeSegmenter.segment(text)[Symbol.iterator]().next().value

    return first?.segment.length ?? 0
  }

  return Array.from(text)[0]?.length ?? 0
}

function lastGraphemeLength(text: string) {
  if (!text) {
    return 0
  }

  if (graphemeSegmenter) {
    let length = 0

    for (const segment of graphemeSegmenter.segment(text)) {
      length = segment.segment.length
    }

    return length
  }

  return Array.from(text).at(-1)?.length ?? 0
}

function backwardGraphemeRange(state: EditorState, pos: number) {
  const to = clampPosition(state, pos)
  const nodeBefore = state.doc.resolve(to).nodeBefore

  if (!nodeBefore?.isText || !nodeBefore.text) {
    // 位于段落边界时不伪造字符区间，让 ProseMirror 的结构化 Backspace 命令继续处理合并行为。
    return normalizeRange(state, to, to)
  }

  return normalizeRange(state, to - lastGraphemeLength(nodeBefore.text), to)
}

function forwardGraphemeRange(state: EditorState, pos: number) {
  let from = clampPosition(state, pos)

  while (from < state.doc.content.size) {
    const nodeAfter = state.doc.resolve(from).nodeAfter

    // 已删除文字和替换前原文都属于历史展示层，不能再次覆盖其 revision 身份。
    // Delete 连按时越过整段历史文字，再从下一段可编辑正文中取一个完整字素。
    if (nodeAfter?.isText && nodeAfter.marks.some(isHistoricalRevisionMark)) {
      from += nodeAfter.nodeSize
      continue
    }

    break
  }

  const nodeAfter = state.doc.resolve(from).nodeAfter

  if (!nodeAfter?.isText || !nodeAfter.text) {
    return normalizeRange(state, from, from)
  }

  return normalizeRange(state, from, from + firstGraphemeLength(nodeAfter.text))
}

function backwardGraphemeRangeSkippingHistoricalText(state: EditorState, pos: number) {
  let to = clampPosition(state, pos)

  while (to > 0) {
    const nodeBefore = state.doc.resolve(to).nodeBefore

    if (nodeBefore?.isText && nodeBefore.marks.some(isHistoricalRevisionMark)) {
      to -= nodeBefore.nodeSize
      continue
    }

    break
  }

  return backwardGraphemeRange(state, to)
}

export function getRevisionDeleteTargetRange(
  state: EditorState,
  pos: number,
  direction: RevisionDeleteDirection,
) {
  return direction === "forward"
    ? forwardGraphemeRange(state, pos)
    : backwardGraphemeRangeSkippingHistoricalText(state, pos)
}

function hasSameInsertedRevisionIdentity(left: RevisionAttributes, right: RevisionAttributes) {
  // 同一段 inserted 修订只以 id/kind/role 判断身份；createdBy/createdAt 是审计快照，不参与边界归属判断。
  return left.id === right.id && left.kind === right.kind && left.role === "inserted" && right.role === "inserted"
}

export function findMergeableInsertedRevision(state: EditorState, pos: number) {
  if (pos <= 0 || pos > state.doc.content.size) {
    return null
  }

  return state.doc.resolve(pos).nodeBefore?.marks.find(isInsertedRevisionMark)?.attrs ?? null
}

export function findInsertedRevisionAtPosition(state: EditorState, pos: number) {
  const $pos = state.doc.resolve(clampPosition(state, pos))
  const before = $pos.nodeBefore?.marks.find(isInsertedRevisionMark)?.attrs ?? null
  const after = $pos.nodeAfter?.marks.find(isInsertedRevisionMark)?.attrs ?? null

  if (before && after && hasSameInsertedRevisionIdentity(before, after)) {
    return before
  }

  // 光标落在 inserted 文本的开头或结尾时，ProseMirror 只会在一侧暴露 mark；仍应视作编辑同一条修订。
  return before ?? after
}

function findInsertedRevisionCoveringRangeInDoc(doc: ProseMirrorNode, range: TextRange) {
  if (range.from === range.to) {
    const safePos = Math.max(0, Math.min(range.from, doc.content.size))
    const $pos = doc.resolve(safePos)
    const before = $pos.nodeBefore?.marks.find(isInsertedRevisionMark)?.attrs ?? null
    const after = $pos.nodeAfter?.marks.find(isInsertedRevisionMark)?.attrs ?? null

    if (before && after && hasSameInsertedRevisionIdentity(before, after)) {
      return before
    }

    return before ?? after
  }

  let insertedAttrs: RevisionAttributes | null = null
  let hasText = false
  let coveredBySameRevision = true

  doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText || !node.text) {
      return coveredBySameRevision
    }

    hasText = true

    const markAttrs = node.marks.find(isInsertedRevisionMark)?.attrs ?? null

    if (!markAttrs) {
      coveredBySameRevision = false
      return false
    }

    if (!insertedAttrs) {
      insertedAttrs = markAttrs
      return true
    }

    coveredBySameRevision = hasSameInsertedRevisionIdentity(insertedAttrs, markAttrs)
    return coveredBySameRevision
  })

  return hasText && coveredBySameRevision ? insertedAttrs : null
}

export function findInsertedRevisionCoveringRange(state: EditorState, range: TextRange) {
  return findInsertedRevisionCoveringRangeInDoc(state.doc, range)
}

function makeRevisionAttrs(
  options: RevisionTrackingOptions,
  kind: NovelRevisionKind,
  role: NovelRevisionRole,
  groupId?: string | null,
  id?: string | null,
): RevisionAttributes {
  return {
    id: id ?? createPrefixedId("revision"),
    groupId: groupId ?? createPrefixedId("revision_group"),
    kind,
    role,
    createdBy: options.createdBy ?? fallbackActor(),
    createdAt: new Date().toISOString(),
  }
}

export function makeOriginalRevisionAttrs(insertedAttrs: RevisionAttributes): RevisionAttributes {
  // 替换修订必须让 inserted/original 共用同一个 id，讨论栏和清稿投影都按 id 聚合。
  // 这里只改 role，其余 id、kind、groupId、createdBy、createdAt 都沿用 inserted 段。
  return {
    ...insertedAttrs,
    role: "original",
  }
}

function getRevisionMarkType(state: EditorState) {
  return state.schema.marks.revision
}

function createRevisionMark(state: EditorState, attrs: RevisionAttributes) {
  return getRevisionMarkType(state)?.create(attrs) ?? null
}

export function resolveInsertedRevision(
  state: EditorState,
  from: number,
  options: RevisionTrackingOptions,
  allowMerge: boolean,
  isReplacement: boolean,
) {
  // inserted 修订的复用只看“文档邻接”：光标左侧如果紧贴一个 role="inserted" 的修订，
  // 就直接复用它的完整 attrs。这里不能依赖 plugin state，因为 state 只描述最近一次事务，
  // 光标移动、组合输入和异步事务都可能让它变成易失信息。
  if (allowMerge) {
    const existing = findMergeableInsertedRevision(state, from)

    if (existing) {
      return existing
    }
  }

  return makeRevisionAttrs(options, isReplacement ? "replace" : "insert", "inserted")
}

function createMarkedText(state: EditorState, text: string, revisionMark: ProseMirrorMark) {
  return state.schema.text(text, revisionMark.addToSet(getTypingMarks(state)))
}

function applyTextWithinInsertedRevision(view: EditorView, text: string, range: TextRange, insertedAttrs: RevisionAttributes) {
  const { state } = view
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return false
  }

  const textNode = createMarkedText(state, text, insertedMark)
  const tr = state.tr.replaceWith(range.from, range.to, textNode)
  const insertedTo = range.from + textNode.nodeSize

  tr.setSelection(TextSelection.create(tr.doc, insertedTo))
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedAttrs.kind,
    role: "inserted",
    from: range.from,
    to: insertedTo,
  } satisfies RevisionPluginMeta)

  view.dispatch(tr.scrollIntoView())
  return true
}

function applyPlainTextWithoutRevision(view: EditorView, text: string, range: TextRange) {
  if (!text) {
    return false
  }

  const { state } = view
  const textNode = state.schema.text(text, getTypingMarks(state))
  const tr = state.tr.replaceWith(range.from, range.to, textNode)
  const cursorPos = range.from + textNode.nodeSize

  // 关闭追踪时也不能让光标继承旧 revision mark；这里保留普通格式，只过滤修订身份。
  tr.setSelection(TextSelection.create(tr.doc, cursorPos))
  view.dispatch(tr.scrollIntoView())
  return true
}

export function applyInsertedText(
  view: EditorView,
  text: string,
  range: TextRange,
  options: RevisionTrackingOptions,
  inputOptions: { allowMerge: boolean } = { allowMerge: true },
) {
  if (!options.enabled || !text) {
    return false
  }

  const { state } = view
  const existingInsertedAttrs = findInsertedRevisionCoveringRange(state, range)

  if (existingInsertedAttrs) {
    // 已有新增/替换文本内部的再次输入，本质是在修改同一个 inserted 修订。
    // 这里直接替换原选区并沿用原 attrs，避免生成新的 revision，或把旧 inserted 文本误标成 original。
    return applyTextWithinInsertedRevision(view, text, range, existingInsertedAttrs)
  }

  const originalSegments = range.from === range.to ? [] : collectRevisionTextSegments(state, range)
  const replacesPlainText = originalSegments.some((segment) => segment.kind === "plain")
  const insertedAttrs = resolveInsertedRevision(
    state,
    range.from,
    options,
    range.from === range.to && inputOptions.allowMerge,
    replacesPlainText,
  )
  const insertedKind = insertedAttrs.kind
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return false
  }

  const tr = state.tr
  const textNode = createMarkedText(state, text, insertedMark)

  tr.insert(range.from, textNode)

  const insertedTo = range.from + textNode.nodeSize

  let originalMark: ProseMirrorMark | null = null

  if (replacesPlainText) {
    originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

    if (!originalMark) {
      return false
    }
  }

  // 只要用户原选区非空，就要物理移除其中从未属于底稿的 inserted 文本；
  // 普通正文才会转成当前 replace/original，已有 deleted/original 历史展示层则原样保留。
  for (let i = originalSegments.length - 1; i >= 0; i--) {
    const segment = originalSegments[i]
    const originalFrom = tr.mapping.map(segment.from, 1)
    const originalTo = tr.mapping.map(segment.to, 1)

    if (segment.kind === "inserted") {
      tr.delete(originalFrom, originalTo)
    } else if (segment.kind === "plain" && originalMark) {
      tr.addMark(originalFrom, originalTo, originalMark)
    }
    // 已存在的 deleted/original 修订属于历史语义，替换选区时不覆盖它们的 revision 身份。
  }

  tr.setSelection(TextSelection.create(tr.doc, insertedTo))
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedKind,
    role: "inserted",
    from: range.from,
    to: insertedTo,
  } satisfies RevisionPluginMeta)

  view.dispatch(tr.scrollIntoView())
  return true
}

function markPastedNode(node: ProseMirrorNode, insertedMark: ProseMirrorMark): ProseMirrorNode {
  if (node.isText) {
    // 粘贴只继承普通排版 marks；外部文档携带的 comment/revision 身份不属于当前审稿会话，必须剥离。
    const ordinaryMarks = node.marks.filter((mark) => mark.type.name !== "comment" && mark.type.name !== "revision")

    return node.mark(insertedMark.addToSet(ordinaryMarks))
  }

  if (node.isLeaf) {
    return node
  }

  const children: ProseMirrorNode[] = []
  node.content.forEach((child) => {
    children.push(markPastedNode(child, insertedMark))
  })

  const content = Fragment.fromArray(children)

  if (isNovelTextBlockNode(node)) {
    // 从本编辑器复制整段时，Slice 会携带原 paragraph/heading 的 block id。
    // 粘贴副本绝不能复用该 id；尤其粘到原块之前时，后置全局 first-wins 去重会错误改写真正原块，
    // 让批注/编辑建议等既有锚点转而指向副本。这里在插入前明确清空，BlockId 插件只会给新块分配新身份。
    return node.type.create({ ...node.attrs, id: null }, content, node.marks)
  }

  return node.copy(content)
}

function markPastedSlice(slice: Slice, insertedMark: ProseMirrorMark) {
  const children: ProseMirrorNode[] = []

  slice.content.forEach((node) => {
    children.push(markPastedNode(node, insertedMark))
  })

  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
}

function sliceContainsText(slice: Slice) {
  let hasText = false

  slice.content.descendants((node) => {
    if (node.isText && Boolean(node.text)) {
      hasText = true
      return false
    }

    return !hasText
  })

  return hasText
}

export function applyInsertedSlice(
  view: EditorView,
  slice: Slice,
  range: TextRange,
  options: RevisionTrackingOptions,
  inputOptions: { uiEvent?: "paste" | "drop" } = {},
) {
  if (!options.enabled || !sliceContainsText(slice)) {
    return false
  }

  const { state } = view
  const existingInsertedAttrs = findInsertedRevisionCoveringRange(state, range)
  const originalSegments = range.from === range.to ? [] : collectRevisionTextSegments(state, range)
  const replacesPlainText = originalSegments.some((segment) => segment.kind === "plain")
  const insertedAttrs =
    existingInsertedAttrs ?? resolveInsertedRevision(state, range.from, options, false, replacesPlainText)
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return false
  }

  const revisionSlice = markPastedSlice(slice, insertedMark)
  const tr = state.tr

  if (existingInsertedAttrs) {
    // 同一 inserted 修订内部粘贴属于直接改写，不保留被替换的旧 inserted 文字。
    tr.replaceRange(range.from, range.to, revisionSlice)
  } else {
    // 替换底稿时先在选区起点插入修订内容，原选区文字继续留在文档中并在下方标成 original。
    // replaceRange 能保留 ProseMirror 已解析的段落结构，避免把多段粘贴压成一个含换行符的 text node。
    tr.replaceRange(range.from, range.from, revisionSlice)
  }

  const insertedFrom = tr.mapping.map(range.from, -1)
  const insertedTo = tr.mapping.map(range.from, 1)
  let originalMark: ProseMirrorMark | null = null

  if (!existingInsertedAttrs && replacesPlainText) {
    originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

    if (!originalMark) {
      return false
    }
  }

  if (!existingInsertedAttrs) {
    for (let index = originalSegments.length - 1; index >= 0; index--) {
      const segment = originalSegments[index]
      const originalFrom = tr.mapping.map(segment.from, 1)
      const originalTo = tr.mapping.map(segment.to, 1)

      if (segment.kind === "inserted") {
        tr.delete(originalFrom, originalTo)
      } else if (segment.kind === "plain" && originalMark) {
        tr.addMark(originalFrom, originalTo, originalMark)
      }
      // deleted/original 是旧审计展示层；粘贴覆盖选区时仍要保留其原 revision 身份。
    }
  }

  const safeCursor = Math.max(0, Math.min(insertedTo, tr.doc.content.size))
  tr.setSelection(ProseMirrorSelection.near(tr.doc.resolve(safeCursor), -1))
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedAttrs.kind,
    role: "inserted",
    from: insertedFrom,
    to: insertedTo,
  } satisfies RevisionPluginMeta)
  const uiEvent = inputOptions.uiEvent ?? "paste"

  tr.setMeta(uiEvent, true)
  tr.setMeta("uiEvent", uiEvent)
  view.dispatch(tr.scrollIntoView())
  return true
}

export function markDeletedRange(
  state: EditorState,
  range: TextRange,
  options: RevisionTrackingOptions,
  dispatch?: (tr: Transaction) => void,
  selectionSide: "start" | "end" = "start",
) {
  if (!options.enabled || range.from === range.to || !rangeContainsText(state, range)) {
    return false
  }

  const tr = state.tr
  const segments = collectRevisionTextSegments(state, range)

  if (segments.length === 0) {
    return false
  }

  const pluginState = revisionTrackingKey.getState(state)
  const deleteDirection: RevisionDeleteDirection = selectionSide === "end" ? "forward" : "backward"
  const canContinuePreviousDelete = Boolean(
    pluginState?.lastDeleteAttrs &&
      pluginState.deleteDirection === deleteDirection &&
      pluginState.continuationBoundary !== null &&
      (deleteDirection === "backward"
        ? range.to === pluginState.continuationBoundary
        : range.from === pluginState.continuationBoundary),
  )
  const operationGroupId = createPrefixedId("revision_group")
  const attrsBySegment = new Map<number, RevisionAttributes>()

  // 先按文档顺序把 plain 段聚合成连续区间，再为每个区间分配一次修订身份。
  // 事务仍会在下方从右向左执行，这样既能稳定处理 position，又不会让 Delete/Backspace 的方向影响 id 选择。
  let runStartIndex: number | null = null
  let runEndIndex: number | null = null

  function assignPlainRun() {
    if (runStartIndex === null || runEndIndex === null) {
      return
    }

    const runFrom = segments[runStartIndex].from
    const runTo = segments[runEndIndex].to
    const touchesContinuationEdge =
      canContinuePreviousDelete &&
      (deleteDirection === "backward" ? runTo === range.to : runFrom === range.from)
    const attrs = touchesContinuationEdge
      ? pluginState!.lastDeleteAttrs!
      : makeRevisionAttrs(options, "delete", "deleted", operationGroupId)

    for (let index = runStartIndex; index <= runEndIndex; index++) {
      if (segments[index].kind === "plain") {
        attrsBySegment.set(index, attrs)
      }
    }

    runStartIndex = null
    runEndIndex = null
  }

  for (let index = 0; index < segments.length; index++) {
    const segment = segments[index]

    if (segment.kind !== "plain") {
      assignPlainRun()
      continue
    }

    if (runStartIndex === null) {
      runStartIndex = index
      runEndIndex = index
      continue
    }

    const previous = segments[runEndIndex!]

    if (previous.to === segment.from) {
      runEndIndex = index
    } else {
      assignPlainRun()
      runStartIndex = index
      runEndIndex = index
    }
  }

  assignPlainRun()

  let hasChanges = false
  let leftmostMarkedAttrs: RevisionAttributes | null = null
  let rightmostMarkedAttrs: RevisionAttributes | null = null

  // 从右向左处理，避免物理删除 inserted 文本后让左侧尚未处理的 position 失效。
  for (let i = segments.length - 1; i >= 0; i--) {
    const { from, to, kind } = segments[i]

    if (kind === "inserted") {
      tr.delete(from, to)
      hasChanges = true
    } else if (kind === "plain") {
      const attrs = attrsBySegment.get(i)

      if (!attrs) {
        continue
      }

      const mark = createRevisionMark(state, attrs)

      if (mark) {
        tr.addMark(from, to, mark)
        leftmostMarkedAttrs = attrs
        rightmostMarkedAttrs ??= attrs
        hasChanges = true
      }
    }
    // deleted/original 属于已经存在的历史展示层；删除选区可以跨过它们，但绝不能覆盖原 revision mark。
  }

  if (!hasChanges) {
    // 选区如果只包含历史修订，仍需消费本次删除事件，防止 ProseMirror 默认行为把其物理移除。
    return segments.some((segment) => segment.kind === "deleted" || segment.kind === "original")
  }

  const resolvedFrom = tr.mapping.map(range.from)
  const resolvedTo = tr.mapping.map(range.to)
  const cursorPos = selectionSide === "end" ? resolvedTo : resolvedFrom
  tr.setSelection(TextSelection.create(tr.doc, cursorPos))

  const continuationAttrs = deleteDirection === "backward" ? leftmostMarkedAttrs : rightmostMarkedAttrs

  if (continuationAttrs) {
    tr.setMeta(revisionTrackingKey, {
      id: continuationAttrs.id,
      groupId: continuationAttrs.groupId,
      kind: "delete",
      role: "deleted",
      from: resolvedFrom,
      to: resolvedTo,
      deleteDirection,
      continuationBoundary: cursorPos,
      revisionAttrs: continuationAttrs,
    } satisfies RevisionPluginMeta)
  }

  dispatch?.(tr.scrollIntoView())
  return true
}

function domSelectionFromRoot(view: EditorView) {
  const root = view.root

  return "getSelection" in root ? root.getSelection() : document.getSelection()
}

function posFromDOM(view: EditorView, node: Node | null, offset: number, bias: number) {
  if (!node) {
    return null
  }

  try {
    return view.posAtDOM(node, offset, bias)
  } catch {
    if (node === view.dom) {
      return offset <= 0 ? 0 : view.state.doc.content.size
    }

    if (node.nodeType === Node.ELEMENT_NODE) {
      const childCount = node.childNodes.length
      const safeOffset = Math.max(0, Math.min(offset, childCount))

      try {
        return view.posAtDOM(node, safeOffset, bias)
      } catch {
        return null
      }
    }

    return null
  }
}

function rangeFromDOMSelection(view: EditorView) {
  const selection = domSelectionFromRoot(view)

  if (!selection?.anchorNode || !selection.focusNode) {
    return null
  }

  const anchor = posFromDOM(view, selection.anchorNode, selection.anchorOffset, -1)
  const head = posFromDOM(view, selection.focusNode, selection.focusOffset, 1)

  if (anchor == null || head == null) {
    return null
  }

  return normalizeRange(view.state, anchor, head)
}

const backwardBeforeInputTypes = new Set([
  "deleteContentBackward",
  "deleteWordBackward",
  "deleteSoftLineBackward",
  "deleteHardLineBackward",
])

const forwardBeforeInputTypes = new Set([
  "deleteContentForward",
  "deleteWordForward",
  "deleteSoftLineForward",
  "deleteHardLineForward",
])

const revisionInsertBeforeInputTypes = new Set([
  "insertText",
  "insertReplacementText",
  "insertTranspose",
  "insertFromDictation",
  "insertFromYank",
])

function rangeFromBeforeInput(view: EditorView, event: InputEvent) {
  const targetRange = event.getTargetRanges?.()[0]

  if (!targetRange) {
    return rangeFromSelection(view.state, view.state.selection)
  }

  const from = posFromDOM(view, targetRange.startContainer, targetRange.startOffset, -1)
  const to = posFromDOM(view, targetRange.endContainer, targetRange.endOffset, 1)

  if (from == null || to == null) {
    return rangeFromSelection(view.state, view.state.selection)
  }

  return normalizeRange(view.state, from, to)
}

function confirmCommentDeletion(state: EditorState, range: TextRange) {
  if (!rangePhysicallyRemovesComment(state, range)) {
    return true
  }

  return window.confirm("要删除的新增文字包含批注，继续会一并移除该批注定位。确认继续吗？")
}

function captureRange(view: EditorView): TextRange {
  // 正常情况下优先用 DOM 选区：compositionstart 时浏览器光标可能领先于 ProseMirror 的 state.selection。
  // 但 view 尚未挂载或 root 不可用时（headless/测试环境）访问 DOM 选区会抛错，此时退回 ProseMirror 选区。
  try {
    const domRange = rangeFromDOMSelection(view)

    if (domRange) {
      return domRange
    }
  } catch {
    // 忽略：交由下方的 ProseMirror 选区兜底
  }

  return rangeFromSelection(view.state, view.state.selection)
}

function normalizeRangeInDoc(doc: ProseMirrorNode, range: TextRange) {
  const from = Math.max(0, Math.min(range.from, doc.content.size))
  const to = Math.max(0, Math.min(range.to, doc.content.size))

  return {
    from: Math.min(from, to),
    to: Math.max(from, to),
  }
}

function unionTextRanges(left: TextRange | null, right: TextRange): TextRange {
  if (!left) {
    return right
  }

  return {
    from: Math.min(left.from, right.from),
    to: Math.max(left.to, right.to),
  }
}

function mapTextRange(finalize: CompositionFinalizeResult, range: TextRange): TextRange {
  const { mapping, stickyBoundary } = finalize

  if (range.from === range.to) {
    // 下一次输入若正好发生在上一段候选文本末尾，应停留在 inserted 与恢复 original 之间；
    // 其它位置（例如后续段落）仍使用 assoc=1，才能随前文恢复内容向后正确平移。
    const assoc = stickyBoundary !== null && range.from === stickyBoundary ? -1 : 1
    const pos = mapping.map(range.from, assoc)

    return { from: pos, to: pos }
  }

  return {
    from: mapping.map(range.from, -1),
    to: mapping.map(range.to, 1),
  }
}

function observeCompositionTransaction(base: CompositionBase, transaction: Transaction) {
  const compositionId = transaction.getMeta("composition") as number | string | undefined

  if (!transaction.docChanged || compositionId == null) {
    return
  }

  if (base.compositionId !== null && base.compositionId !== compositionId) {
    // 不同 composition id 属于另一次输入法会话；旧会话应先 finalize，不能把两次输入的范围并在一起。
    return
  }

  base.compositionId = compositionId

  for (const stepMap of transaction.mapping.maps) {
    // insertedRange 始终保存在“当前 step 之前”的坐标中，先映射已有范围，再合并该 step 新生成的范围。
    if (base.insertedRange) {
      const mappedFrom = stepMap.map(base.insertedRange.from, -1)
      const mappedTo = stepMap.map(base.insertedRange.to, 1)
      base.insertedRange = {
        from: Math.min(mappedFrom, mappedTo),
        to: Math.max(mappedFrom, mappedTo),
      }
    }

    // 在追加当前 StepMap 前，inverse 能把 step 的旧坐标精确还原到 compositionstart 文档。
    // 这样等长 reconversion、光标前替换和多轮 preedit 都能找到真正原文，而不依赖全文 size 差。
    const inverseToBase = base.mapping.invert()

    stepMap.forEach((oldFrom, oldTo, newFrom, newTo) => {
      const originalFrom = inverseToBase.map(oldFrom, -1)
      const originalTo = inverseToBase.map(oldTo, 1)

      base.originalRange = unionTextRanges(base.originalRange, {
        from: Math.min(originalFrom, originalTo),
        to: Math.max(originalFrom, originalTo),
      })
      base.insertedRange = unionTextRanges(base.insertedRange, {
        from: Math.min(newFrom, newTo),
        to: Math.max(newFrom, newTo),
      })
    })

    base.mapping.appendMap(stepMap)
  }
}

function selectionStillAtCompositionEnd(state: EditorState, insertedRange: TextRange) {
  return state.selection.empty && state.selection.from === insertedRange.to
}

function preserveOrSetCompositionSelection(
  state: EditorState,
  tr: Transaction,
  insertedRange: TextRange,
  cursorPos: number,
) {
  if (selectionStillAtCompositionEnd(state, insertedRange)) {
    tr.setSelection(TextSelection.create(tr.doc, cursorPos))
    return
  }

  const mappedFrom = tr.mapping.map(state.selection.from, 1)
  const mappedTo = tr.mapping.map(state.selection.to, 1)

  try {
    // 如果用户在异步补标执行前已经点击到其它段落，补标事务必须尊重用户的新选区；
    // 否则就会表现为“打字后光标莫名跳回刚才输入的位置”。
    tr.setSelection(TextSelection.create(tr.doc, mappedFrom, mappedTo))
  } catch {
    const safeCursor = Math.max(0, Math.min(cursorPos, tr.doc.content.size))

    tr.setSelection(TextSelection.create(tr.doc, safeCursor))
  }
}

function buildCompositionFinalizationTransaction(
  state: EditorState,
  base: CompositionBase,
  options: RevisionTrackingOptions,
) {
  if (!options.enabled || !base.originalRange || !base.insertedRange) {
    // 没有任何带 composition meta 的文档 StepMap，说明输入法被取消或没有产生实际修改。
    return null
  }

  const originalRange = normalizeRangeInDoc(base.doc, base.originalRange)
  const insertedRange = normalizeRange(state, base.insertedRange.from, base.insertedRange.to)
  const originalSlice = base.doc.slice(originalRange.from, originalRange.to)
  const currentSlice = state.doc.slice(insertedRange.from, insertedRange.to)

  if (originalSlice.eq(currentSlice)) {
    // 输入法候选被取消、或 reconversion 最终恢复成完全相同的内容与 marks 时，不生成任何修订。
    return null
  }

  const existingInsertedAttrs =
    originalRange.from === originalRange.to
      ? base.existingInsertedAttrs
      : findInsertedRevisionCoveringRangeInDoc(base.doc, originalRange)

  if (existingInsertedAttrs) {
    const tr = state.tr

    if (insertedRange.from !== insertedRange.to) {
      const insertedMark = createRevisionMark(state, existingInsertedAttrs)

      if (!insertedMark) {
        return null
      }

      tr.addMark(insertedRange.from, insertedRange.to, insertedMark)
    }
    // inserted 文本本来就不是底稿：IME 把它改空时保留 native 的物理删除结果，不创建 deleted 修订。
    const cursorPos = insertedRange.to
    preserveOrSetCompositionSelection(state, tr, insertedRange, cursorPos)
    tr.setMeta(revisionTrackingKey, {
      id: existingInsertedAttrs.id,
      groupId: existingInsertedAttrs.groupId,
      kind: existingInsertedAttrs.kind,
      role: "inserted",
      from: insertedRange.from,
      to: cursorPos,
      composition: true,
      forcePublish: !tr.docChanged,
    } satisfies RevisionPluginMeta)
    return tr
  }

  const isReplacement = originalRange.from !== originalRange.to

  if (insertedRange.from === insertedRange.to) {
    if (!isReplacement) {
      return null
    }

    // “有原文、最终提交为空”是一次删除，不允许 native transaction 把底稿永久真删。
    // 恢复时只把普通正文标成 deleted；已有 deleted/original 必须保留原 revision 身份，
    // 原本属于 inserted 的文字则继续维持 native 的物理删除结果。
    const deletedAttrs = makeRevisionAttrs(options, "delete", "deleted")
    const deletedMark = createRevisionMark(state, deletedAttrs)

    if (!deletedMark) {
      return null
    }

    const restored = prepareRestoredCompositionSlice(originalSlice, deletedMark)

    if (restored.slice.size === 0) {
      return null
    }

    const tr = state.tr.replace(insertedRange.from, insertedRange.from, restored.slice)
    const deletedTo = insertedRange.from + restored.slice.size

    preserveOrSetCompositionSelection(state, tr, insertedRange, insertedRange.from)

    if (restored.hasPlainText) {
      tr.setMeta(revisionTrackingKey, {
        id: deletedAttrs.id,
        groupId: deletedAttrs.groupId,
        kind: "delete",
        role: "deleted",
        from: insertedRange.from,
        to: deletedTo,
        composition: true,
        deleteDirection: "backward",
        continuationBoundary: insertedRange.from,
        revisionAttrs: deletedAttrs,
      } satisfies RevisionPluginMeta)
    }

    return tr
  }

  // originalRange 非空只说明浏览器替换过可见 DOM；其中可能全是旧 inserted/deleted/original。
  // 只有真实普通正文存在时才创建 replace 修订，否则应视作一次新的 insert，并保留旧历史身份。
  const restorationProbe = prepareRestoredCompositionSlice(originalSlice, null)
  const replacesPlainText = originalRange.from !== originalRange.to && restorationProbe.hasPlainText
  const insertedAttrs = resolveInsertedRevision(
    state,
    insertedRange.from,
    options,
    originalRange.from === originalRange.to,
    replacesPlainText,
  )
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return null
  }

  const tr = state.tr.addMark(insertedRange.from, insertedRange.to, insertedMark)

  if (originalRange.from !== originalRange.to && restorationProbe.slice.size > 0) {
    let restored = restorationProbe

    if (replacesPlainText) {
      const originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

      if (!originalMark) {
        return null
      }

      restored = prepareRestoredCompositionSlice(originalSlice, originalMark)
    }

    const originalFrom = insertedRange.to

    // 修订 mark 已经在 Slice 内按文本段精确写好，不能再对整个区间 addMark，
    // 否则会覆盖其中原有 deleted/original 的 revision id 与审计信息。
    tr.replace(originalFrom, originalFrom, restored.slice)
  }

  const cursorPos = insertedRange.to

  preserveOrSetCompositionSelection(state, tr, insertedRange, cursorPos)
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedAttrs.kind,
    role: "inserted",
    from: insertedRange.from,
    to: cursorPos,
    composition: true,
    forcePublish: !tr.docChanged,
  } satisfies RevisionPluginMeta)
  return tr
}

export function finalizeComposition(view: EditorView, base: CompositionBase, options: RevisionTrackingOptions) {
  const tr = buildCompositionFinalizationTransaction(view.state, base, options)

  if (!tr) {
    return false
  }

  view.dispatch(tr)
  return true
}

// 输入法（composition）状态机：浏览器仍负责候选窗和临时 DOM，控制器只观察带 composition meta 的 transaction。
// 最终修订优先由 appendTransaction 在同一 applyTransaction 批次追加；timer 只负责“没有尾事务”时触发，绝不再猜范围。
export function createRevisionCompositionController(getOptions: () => RevisionTrackingOptions) {
  let isComposing = false
  let compositionBase: CompositionBase | null = null
  let compositionTimer: ReturnType<typeof setTimeout> | null = null

  function flushPendingComposition(view: EditorView) {
    if (!compositionBase || isComposing) {
      return null
    }

    if (compositionTimer) {
      clearTimeout(compositionTimer)
    }

    compositionTimer = null
    const base = compositionBase
    compositionBase = null
    const stickyBoundary = base.insertedRange?.to ?? null
    const tr = buildCompositionFinalizationTransaction(view.state, base, getOptions())

    if (!tr) {
      return null
    }

    view.dispatch(tr)
    return {
      mapping: tr.mapping,
      stickyBoundary,
    }
  }

  function takePendingCompositionTransaction(state: EditorState) {
    if (!compositionBase || isComposing) {
      return null
    }

    if (compositionTimer) {
      clearTimeout(compositionTimer)
    }

    compositionTimer = null
    const base = compositionBase
    compositionBase = null
    return buildCompositionFinalizationTransaction(state, base, getOptions())
  }

  const runtime: RevisionCompositionRuntime = {
    // handleTextInput/handlePaste 用它判断是否处在输入法会话中（此时不能再走直接插入路径）。
    isComposing() {
      return isComposing
    },
    hasPendingFinalize() {
      return Boolean(compositionBase && !isComposing)
    },
    flushPendingFinalize(view: EditorView) {
      return flushPendingComposition(view)
    },
  }

  return {
    ...runtime,
    observeTransaction(transaction: Transaction) {
      if (compositionBase) {
        observeCompositionTransaction(compositionBase, transaction)
      }
    },
    appendFinalization(transactions: readonly Transaction[], state: EditorState) {
      const hasFinalCompositionChange = transactions.some(
        (transaction) => transaction.docChanged && transaction.getMeta("composition") != null,
      )

      return hasFinalCompositionChange ? takePendingCompositionTransaction(state) : null
    },
    handleCompositionStart(view: EditorView) {
      const options = getOptions()

      if (!options.enabled) {
        return false
      }

      flushPendingComposition(view)

      const range = captureRange(view)

      isComposing = true
      compositionBase = {
        selection: range,
        doc: view.state.doc,
        mapping: new Mapping(),
        originalRange: null,
        insertedRange: null,
        compositionId: null,
        // compositionend 时 native transaction 可能已经改写选区，因此必须在开始时记录 inserted 身份。
        existingInsertedAttrs: findInsertedRevisionCoveringRange(view.state, range),
      }

      return false
    },
    handleCompositionEnd(view: EditorView) {
      if (!getOptions().enabled || !compositionBase) {
        isComposing = false
        return false
      }

      const base = compositionBase

      // ProseMirror 会在内置 compositionend 处理器中同步 flush，或把最终 DOMObserver flush 放进微任务。
      // timer 运行得更晚，只在没有可供 appendTransaction 收口的尾事务时执行同一个 transaction builder。
      isComposing = false
      compositionTimer = setTimeout(() => {
        compositionTimer = null

        if (compositionBase !== base) {
          return
        }

        const tr = takePendingCompositionTransaction(view.state)

        if (tr) {
          view.dispatch(tr)
        }
      }, 0)

      return false
    },
    destroy() {
      if (compositionTimer) {
        clearTimeout(compositionTimer)
      }

      isComposing = false
      compositionBase = null
      compositionTimer = null
    },
  }
}

export function isRevisionCompositionBusy(editor: Editor | null) {
  if (!editor || editor.isDestroyed) {
    return false
  }

  const runtime = revisionCompositionRuntimeByView.get(editor.view)

  // view.composing 是 ProseMirror 对浏览器原生 IME 会话的判断；
  // runtime.hasPendingFinalize 则覆盖 compositionend 已发生、但延迟补标事务尚未落地的短暂窗口。
  return Boolean(editor.view.composing || runtime?.isComposing() || runtime?.hasPendingFinalize())
}

export function flushPendingRevisionComposition(editor: Editor | null) {
  if (!editor || editor.isDestroyed || editor.view.composing) {
    return false
  }

  const runtime = revisionCompositionRuntimeByView.get(editor.view)

  return Boolean(runtime?.flushPendingFinalize(editor.view))
}

export const NovelDocument = Document.extend({
  addAttributes() {
    return {
      schemaVersion: { default: 1 },
      docId: { default: null },
      docType: { default: null },
      title: { default: null },
      createdAt: { default: null },
      updatedAt: { default: null },
    }
  },
})

export const NovelParagraph = Paragraph.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-block-id": attrs.id } : {}),
      },
    }
  },
})

export const NovelHeading = Heading.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-block-id"),
        renderHTML: (attrs) => (attrs.id ? { "data-block-id": attrs.id } : {}),
      },
    }
  },
})

function isNovelTextBlockNode(node: ProseMirrorNode) {
  return node.type.name === "paragraph" || node.type.name === "heading"
}

function isUsableBlockId(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0
}

export function normalizeNovelBlockIdsInState(state: EditorState) {
  const unavailableIds = new Set<string>()

  // 第一遍预留全部现有合法 id，确保为坏数据生成新值时不会碰撞后文尚未遍历到的合法锚点。
  state.doc.forEach((node) => {
    if (isNovelTextBlockNode(node) && isUsableBlockId(node.attrs.id)) {
      unavailableIds.add(node.attrs.id)
    }
  })

  const seenIds = new Set<string>()
  const tr = state.tr
  let changed = false

  state.doc.forEach((node, pos) => {
    if (!isNovelTextBlockNode(node)) {
      return
    }

    const existingId = node.attrs.id

    if (isUsableBlockId(existingId) && !seenIds.has(existingId)) {
      seenIds.add(existingId)
      return
    }

    const kind = node.type.name === "heading" ? "h" : "p"
    const generatedBase = createNovelBlockId(kind)
    let id = generatedBase
    let suffix = 1

    while (unavailableIds.has(id)) {
      id = `${generatedBase}_${suffix}`
      suffix += 1
    }

    unavailableIds.add(id)
    seenIds.add(id)
    tr.setNodeMarkup(pos, undefined, { ...node.attrs, id })
    changed = true
  })

  if (!changed) {
    return null
  }

  // BlockId 是结构不变量而不是用户编辑内容，不能单独进入 undo 历史。
  // 不手工 setSelection：Transaction 会把 state.selection 自动映射到所有 setNodeMarkup step 之后的文档。
  tr.setMeta("addToHistory", false)
  tr.setMeta("novelBlockIdNormalization", true)
  return tr
}

function transactionsMayChangeBlockIdentity(
  transactions: readonly Transaction[],
  oldState: EditorState,
  newState: EditorState,
) {
  if (!transactions.some((transaction) => transaction.docChanged)) {
    return false
  }

  if (oldState.doc.childCount !== newState.doc.childCount) {
    // Enter/split、跨段合并和多段粘贴会改变顶层块数量，也最容易复制旧 id 或产生空 id。
    return true
  }

  if (
    transactions.some(
      (transaction) =>
        transaction.getMeta("paste") ||
        transaction.getMeta("drop") ||
        transaction.getMeta("uiEvent") === "paste" ||
        transaction.getMeta("uiEvent") === "drop" ||
        transaction.getMeta("preventUpdate"),
    )
  ) {
    return true
  }

  const { $from } = newState.selection

  if ($from.depth < 1) {
    return false
  }

  const currentBlock = $from.node(1)

  // 普通文字和 mark 修改只检查当前块即可，避免长篇小说每输入一个字都 O(N) 扫描整篇文档。
  return isNovelTextBlockNode(currentBlock) && !isUsableBlockId(currentBlock.attrs.id)
}

export const BlockId = Extension.create({
  name: "blockId",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, oldState, newState) {
          if (!transactionsMayChangeBlockIdentity(transactions, oldState, newState)) {
            return null
          }

          return normalizeNovelBlockIdsInState(newState)
        },
      }),
    ]
  },
})

export const CommentMark = Mark.create({
  name: "comment",
  inclusive: false,
  excludes: "",

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-comment-id": attributes.id } : {}),
      },
      kind: {
        default: "normal",
        parseHTML: (element) => element.getAttribute("data-comment-kind") || "normal",
        renderHTML: (attributes) => (attributes.kind ? { "data-comment-kind": attributes.kind } : {}),
      },
      body: {
        default: "",
        parseHTML: (element) => element.getAttribute("data-comment-body") || element.getAttribute("title") || "",
        renderHTML: (attributes) => (attributes.body ? { "data-comment-body": attributes.body, title: attributes.body } : {}),
      },
      createdBy: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute("data-comment-created-by")
          if (!val) return null
          try {
            return JSON.parse(val)
          } catch {
            return null
          }
        },
        renderHTML: (attrs) => (attrs.createdBy ? { "data-comment-created-by": JSON.stringify(attrs.createdBy) } : {}),
      },
      createdAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-created-at"),
        renderHTML: (attrs) => (attrs.createdAt ? { "data-comment-created-at": attrs.createdAt } : {}),
      },
      updatedAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-comment-updated-at"),
        renderHTML: (attrs) => (attrs.updatedAt ? { "data-comment-updated-at": attrs.updatedAt } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },
})

export function addCommentToRange(
  editor: Editor,
  input: { from: number; to: number; body: string; createdBy: NovelCreatedBy },
) {
  const body = input.body.trim()
  const range = normalizeRange(editor.state, input.from, input.to)

  if (!body || range.from === range.to) {
    return false
  }

  const markType = editor.state.schema.marks.comment

  if (!markType) {
    return false
  }

  const attrs: CommentAttributes = {
    id: createPrefixedId("comment"),
    kind: "normal",
    body,
    createdBy: input.createdBy,
    createdAt: new Date().toISOString(),
    updatedAt: null,
  }
  const tr = editor.state.tr.addMark(range.from, range.to, markType.create(attrs))

  tr.setSelection(TextSelection.create(tr.doc, range.to))
  editor.view.dispatch(tr.scrollIntoView())
  editor.view.focus()
  return true
}

export function updateCommentBody(editor: Editor, commentId: string, nextBody: string) {
  const body = nextBody.trim()
  const markType = editor.state.schema.marks.comment

  // 空批注、失效身份和只读编辑器都不能产生事务；在数据层统一兜底，避免其它入口绕过界面禁用状态。
  if (!editor.isEditable || !commentId || !body || !markType) {
    return false
  }

  const tr = editor.state.tr
  const updatedAt = new Date().toISOString()
  let found = false

  // 同一条批注可能跨越多个文本节点，或因加粗、修订等其它 mark 被拆成多个片段。
  // 必须按 commentId 更新全部片段，才能防止侧栏内容与鼠标悬浮 title 在不同位置显示旧值。
  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }

    node.marks.forEach((mark) => {
      if (mark.type.name !== "comment" || mark.attrs.id !== commentId) {
        return
      }

      found = true
      tr.removeMark(pos, pos + node.nodeSize, mark)
      tr.addMark(
        pos,
        pos + node.nodeSize,
        markType.create({
          ...mark.attrs,
          body,
          // 保留创建人和创建时间，只刷新修改时间，保证批注的审计信息不会被编辑操作覆盖。
          updatedAt,
        }),
      )
    })
  })

  if (!found) {
    return false
  }

  // mark 属性修改会进入现有 onUpdate/自动保存链路，无需增加新的接口或后端字段。
  editor.view.dispatch(tr)
  return true
}

export const RevisionMark = Mark.create<RevisionTrackingOptions>({
  name: "revision",
  inclusive: false,
  excludes: "revision",

  addOptions() {
    return {
      enabled: false,
      createdBy: fallbackActor(),
    }
  },

  addAttributes() {
    return {
      id: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-revision-id"),
        renderHTML: (attributes) => (attributes.id ? { "data-revision-id": attributes.id } : {}),
      },
      groupId: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-revision-group-id"),
        renderHTML: (attributes) => (attributes.groupId ? { "data-revision-group-id": attributes.groupId } : {}),
      },
      kind: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-revision-kind"),
        renderHTML: (attributes) => (attributes.kind ? { "data-revision-kind": attributes.kind } : {}),
      },
      role: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-revision-role"),
        renderHTML: (attributes) => (attributes.role ? { "data-revision-role": attributes.role } : {}),
      },
      createdBy: {
        default: null,
        parseHTML: (element) => {
          const val = element.getAttribute("data-revision-created-by")
          if (!val) return null
          try {
            return JSON.parse(val)
          } catch {
            return null
          }
        },
        renderHTML: (attributes) => (attributes.createdBy ? { "data-revision-created-by": JSON.stringify(attributes.createdBy) } : {}),
      },
      createdAt: {
        default: null,
        parseHTML: (element) => element.getAttribute("data-revision-created-at"),
        renderHTML: (attributes) => (attributes.createdAt ? { "data-revision-created-at": attributes.createdAt } : {}),
      },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-revision-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes(HTMLAttributes), 0]
  },

  addCommands() {
    return {
      markSelectionAsDeletedRevision:
        () =>
        ({ state, dispatch }) =>
          markDeletedRange(state, rangeFromSelection(state, state.selection), this.options, dispatch),
    }
  },

  addProseMirrorPlugins() {
    const composition = createRevisionCompositionController(() => this.options)

    return [
      new Plugin<RevisionPluginState>({
        key: revisionTrackingKey,
        appendTransaction(transactions, _oldState, newState) {
          // compositionend 后如果 ProseMirror 还有最后一笔原生 DOM transaction，优先在同一个
          // applyTransaction 批次里追加最终修订；Tiptap 对外只会观察到已经带完整 revision 语义的 state。
          return composition.appendFinalization(transactions, newState)
        },
        view(view) {
          revisionCompositionRuntimeByView.set(view, composition)

          return {
            destroy() {
              composition.destroy()
              revisionCompositionRuntimeByView.delete(view)
            },
          }
        },
        state: {
          init: () => ({ lastDeleteAttrs: null, continuationBoundary: null, deleteDirection: null }),
          apply(transaction, value) {
            // controller 必须在 appendTransaction 运行前看到原生 composition 的每个 StepMap；
            // state.apply 正好按真实事务顺序执行，且不会触碰 DOM。
            composition.observeTransaction(transaction)

            const meta = transaction.getMeta(revisionTrackingKey) as RevisionPluginMeta | undefined

            if (
              meta?.kind === "delete" &&
              meta.revisionAttrs &&
              meta.deleteDirection &&
              typeof meta.continuationBoundary === "number"
            ) {
              return {
                lastDeleteAttrs: meta.revisionAttrs,
                continuationBoundary: meta.continuationBoundary,
                deleteDirection: meta.deleteDirection,
              }
            }

            if (meta?.id || transaction.docChanged || transaction.selectionSet) {
              // 输入、粘贴、undo/redo、setContent 和未知外部事务都必须中止连续删除。
              // 只有上面的显式 delete meta 可以延续 identity，避免 undo 后“复活”已经撤销的 revision id。
              return { lastDeleteAttrs: null, continuationBoundary: null, deleteDirection: null }
            }

            return value
          },
        },
        props: {
          handleTextInput: (view, from, to, text) => {
            if (composition.isComposing() || view.composing) {
              return false
            }

            // from/to 属于 flush 前的 state。finalize replacement 时会把原文重新插回文档，
            // 所以后续位置必须通过 finalize transaction.mapping 映射；继续使用旧坐标会把文字插进其它段落。
            const inputRangeBeforeFinalize = normalizeRange(view.state, from, to)
            const finalizeMapping = composition.flushPendingFinalize(view)
            const mappedInputRange = finalizeMapping
              ? mapTextRange(finalizeMapping, inputRangeBeforeFinalize)
              : inputRangeBeforeFinalize
            const inputRange = normalizeRange(view.state, mappedInputRange.from, mappedInputRange.to)

            if (!this.options.enabled) {
              return applyPlainTextWithoutRevision(view, text, inputRange)
            }

            return applyInsertedText(view, text, inputRange, this.options)
          },
          handlePaste: (view, _event, slice) => {
            if (composition.isComposing() || view.composing) {
              return false
            }

            // 粘贴也可能发生在 IME 补标计时器之前；这里先收口上一段输入，避免粘贴内容和上一段无标记文本混在一起。
            composition.flushPendingFinalize(view)

            if (!this.options.enabled) {
              // 非修订模式完全交还 ProseMirror 默认 paste，让 HTML、段落和普通格式按原生 Slice 规则保留。
              return false
            }

            return applyInsertedSlice(
              view,
              slice,
              rangeFromSelection(view.state, view.state.selection),
              this.options,
            )
          },
          handleDrop: (view, event, slice, moved) => {
            if (composition.isComposing() || view.composing) {
              return false
            }

            composition.flushPendingFinalize(view)

            if (!this.options.enabled) {
              return false
            }

            if (moved) {
              // ProseMirror 默认的内部拖移会“真删源选区 + 普通插入目标”，无法表达审稿语义。
              // 在修订模式下明确消费移动式拖放，避免正文绕过 revision；按住复制修饰键的 drag-copy
              // 以及从外部拖入文字仍走下方统一 Slice 插入管线。用户若要移动正文可使用剪切/粘贴。
              if (event.dataTransfer) {
                event.dataTransfer.dropEffect = "none"
              }

              return true
            }

            const coordinates = view.posAtCoords({ left: event.clientX, top: event.clientY })

            if (!coordinates) {
              // 无法可靠解析落点时也不能交还默认 drop，否则会产生没有 revision mark 的原文。
              return true
            }

            const insertPosition = dropPoint(view.state.doc, coordinates.pos, slice) ?? coordinates.pos
            applyInsertedSlice(
              view,
              slice,
              { from: insertPosition, to: insertPosition },
              this.options,
              { uiEvent: "drop" },
            )

            // 当前 schema 不支持的非文字 Slice 也应被消费，确保任何 drop 都不能绕过修订控制器。
            return true
          },
          handleKeyDown: (view, event) => {
            if (!this.options.enabled || (event.key !== "Backspace" && event.key !== "Delete")) {
              return false
            }

            if (composition.isComposing() || view.composing || event.isComposing || event.keyCode === 229) {
              return false
            }

            if (view.state.selection.empty && (event.altKey || event.ctrlKey || event.metaKey)) {
              // 按词/按行删除的真实范围由 beforeinput.getTargetRanges 提供；keydown 固定 ±1 会吞错范围并拆坏 Unicode。
              return false
            }

            // 删除键是最容易命中 IME 补标窗口期的操作：用户刚打错一个字马上退格时，
            // 必须先把这个字标成 inserted，后续删除才会走“删除新增文本”而不是“标删原文”。
            composition.flushPendingFinalize(view)

            const { state } = view
            const range = rangeFromSelection(state, state.selection)
            const targetRange =
              range.from !== range.to
                ? range
                : event.key === "Backspace"
                  ? getRevisionDeleteTargetRange(state, state.selection.from, "backward")
                  : getRevisionDeleteTargetRange(state, state.selection.from, "forward")

            if (!confirmCommentDeletion(state, targetRange)) {
              // 即使原选区为空，目标字素也可能是带批注的 inserted 文本；其物理删除会让批注锚点消失，
              // 因此必须按已经解析出的真实 targetRange 统一确认，不能只检查键下时的 selection。
              event.preventDefault()
              return true
            }

            return markDeletedRange(state, targetRange, this.options, view.dispatch, event.key === "Delete" ? "end" : "start")
          },
          handleDOMEvents: {
            compositionstart: (view) => composition.handleCompositionStart(view),
            compositionend: (view) => composition.handleCompositionEnd(view),
            beforeinput: (view, domEvent) => {
              const event = domEvent as InputEvent

              if (
                !this.options.enabled ||
                !event.cancelable ||
                event.isComposing ||
                composition.isComposing() ||
                view.composing
              ) {
                return false
              }

              const isBackwardDelete = backwardBeforeInputTypes.has(event.inputType)
              const isForwardDelete = forwardBeforeInputTypes.has(event.inputType)
              const isRevisionInsert = revisionInsertBeforeInputTypes.has(event.inputType)

              if (!isBackwardDelete && !isForwardDelete && !isRevisionInsert) {
                return false
              }

              // StaticRange 与 handleTextInput 的 from/to 一样属于 finalize 前的 state；统一通过 Mapping 升级坐标。
              const rangeBeforeFinalize = rangeFromBeforeInput(view, event)
              const finalizeMapping = composition.flushPendingFinalize(view)
              const mappedRange = finalizeMapping
                ? mapTextRange(finalizeMapping, rangeBeforeFinalize)
                : rangeBeforeFinalize
              let targetRange = normalizeRange(view.state, mappedRange.from, mappedRange.to)

              if (isRevisionInsert && typeof event.data === "string" && event.data.length > 0) {
                const applied = applyInsertedText(view, event.data, targetRange, this.options)

                if (applied) {
                  event.preventDefault()
                }

                return applied
              }

              if (isRevisionInsert && (event.data === null || targetRange.from === targetRange.to)) {
                // 某些语音/浏览器扩展会发出 data=null 的 insert 事件；没有可重放文本时不能擅自改成删除。
                return false
              }

              const direction: RevisionDeleteDirection = isForwardDelete ? "forward" : "backward"

              if (targetRange.from === targetRange.to) {
                targetRange =
                  getRevisionDeleteTargetRange(view.state, targetRange.from, direction)
              }

              if (!confirmCommentDeletion(view.state, targetRange)) {
                event.preventDefault()
                return true
              }

              const applied = markDeletedRange(
                view.state,
                targetRange,
                this.options,
                view.dispatch,
                direction === "forward" ? "end" : "start",
              )

              if (applied) {
                event.preventDefault()
              }

              return applied
            },
            cut: (view, domEvent) => {
              const event = domEvent as ClipboardEvent

              if (!this.options.enabled || composition.isComposing() || view.composing || view.state.selection.empty) {
                return false
              }

              composition.flushPendingFinalize(view)
              const { state } = view
              const range = rangeFromSelection(state, state.selection)

              if (!confirmCommentDeletion(state, range)) {
                event.preventDefault()
                return true
              }

              if (!event.clipboardData) {
                // 无法可靠写入系统剪贴板时交还浏览器，避免出现“文字没复制却已经被标删”的破坏性结果。
                return false
              }

              const { dom, text } = view.serializeForClipboard(state.selection.content())
              event.preventDefault()
              event.clipboardData.clearData()
              event.clipboardData.setData("text/html", dom.innerHTML)
              event.clipboardData.setData("text/plain", text)
              return markDeletedRange(state, range, this.options, view.dispatch)
            },
          },
        },
      }),
    ]
  },
})

function getSelectionTopLevelBlock(editor: Editor) {
  const { selection } = editor.state
  const { $to } = selection

  if ($to.depth < 1) {
    return {
      insertPosition: selection.to,
      anchorBlockId: createNovelBlockId("p"),
    }
  }

  const block = $to.node(1)
  const existingId = typeof block.attrs.id === "string" ? block.attrs.id : createNovelBlockId("p")

  return {
    insertPosition: $to.after(1),
    anchorBlockId: existingId,
  }
}

export function insertEditSuggestionAfterSelection(editor: Editor, createdBy: NovelCreatedBy) {
  if (editor.state.selection.empty) {
    return false
  }

  const { insertPosition, anchorBlockId } = getSelectionTopLevelBlock(editor)

  return editor
    .chain()
    .focus()
    .insertContentAt(insertPosition, {
      type: "editSuggestion",
      attrs: {
        id: createPrefixedId("suggestion"),
        anchorBlockId,
        position: "after",
        category: "other",
        body: "",
        createdBy,
        createdAt: new Date().toISOString(),
        updatedAt: null,
      } satisfies EditSuggestionAttrs,
    })
    .run()
}

// 分类选项是静态配置；提升到模块级后，编辑建议每次输入并同步节点属性时不再重复创建数组。
const EDIT_SUGGESTION_CATEGORY_OPTIONS: Array<{ value: NovelSuggestionCategory; label: string }> = [
  { value: "structure", label: "结构" },
  { value: "logic", label: "逻辑" },
  { value: "rhythm", label: "节奏" },
  { value: "expression", label: "表达" },
  { value: "plot", label: "情节" },
  { value: "character", label: "角色" },
  { value: "worldbuilding", label: "设定" },
  { value: "continuity", label: "连续性" },
  { value: "other", label: "其他" },
]

function EditSuggestionView({ editor, node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as EditSuggestionAttrs
  // 输入值直接以 ProseMirror 节点属性为唯一数据源，避免 React 本地草稿与自动保存使用的文档 JSON 分叉。
  const body = attrs.body ?? ""
  const category = (attrs.category as NovelSuggestionCategory) ?? "other"
  const editable = editor.isEditable
  const [editing, setEditing] = useState(editable && !body)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editable && editing) {
      // Tiptap 插入 NodeView 后会继续处理本轮 selection 事务，立即 focus 可能被编辑器抢回。
      // 延迟到下一帧再滚动和聚焦，确保点击“编辑建议”后光标稳定落到建议输入框。
      const frameId = window.requestAnimationFrame(() => {
        textareaRef.current?.scrollIntoView({
          block: "center",
          behavior: "smooth",
        })
        textareaRef.current?.focus({
          preventScroll: true,
        })
      })

      return () => window.cancelAnimationFrame(frameId)
    }
  }, [editable, editing])

  function persistSuggestionAttributes(nextAttributes: Partial<Pick<EditSuggestionAttrs, "body" | "category">>) {
    // 每次输入或切换分类都立即写回文档节点，使外层 onUpdate 能把最新建议纳入防抖自动保存。
    // 即使用户不再点击小保存图标而直接执行“退回作者”，流程前的 flushAutoSave 也能拿到完整内容。
    updateAttributes({
      ...nextAttributes,
      updatedAt: new Date().toISOString(),
    })
  }

  function saveSuggestion() {
    const nextBody = body.trim()

    if (!nextBody) {
      return
    }

    // 保存按钮只负责结束编辑并规范化首尾空白；正文在键入过程中已经持续写回节点。
    if (nextBody !== body) {
      persistSuggestionAttributes({ body: nextBody })
    }
    setEditing(false)
  }

  return (
    <NodeViewWrapper
      as="section"
      className="my-5 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm shadow-xs"
      contentEditable={false}
      data-edit-suggestion-card=""
    >
      <div className="flex items-start justify-between gap-3 border-b border-amber-200/70 pb-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="mr-1 font-medium text-amber-800">编辑建议</span>
            {editable && editing ? (
              EDIT_SUGGESTION_CATEGORY_OPTIONS.map((option) => {
                const active = category === option.value

                return (
                  <button
                    key={option.value}
                    type="button"
                    className={cn(
                      "inline-flex h-6 items-center rounded-md border px-2 text-[11px] transition-colors",
                      active
                        ? "border-amber-400 bg-amber-500 text-white"
                        : "border-amber-200 bg-white text-amber-800 hover:bg-amber-100",
                    )}
                    onClick={() => {
                      if (!active) {
                        persistSuggestionAttributes({ category: option.value })
                      }
                    }}
                  >
                    {option.label}
                  </button>
                )
              })
            ) : (
              <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-100 px-2 text-[11px] font-medium text-amber-800">
                {EDIT_SUGGESTION_CATEGORY_OPTIONS.find((option) => option.value === category)?.label ?? "其他"}
              </span>
            )}
          </div>
          <span className="truncate text-xs text-amber-700/75">{attrs.createdBy?.nameSnapshot ?? "未知用户"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editable && editing && (
            <button
              className="inline-flex size-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100 disabled:cursor-not-allowed disabled:opacity-50"
              type="button"
              disabled={!body.trim()}
              onClick={saveSuggestion}
              title="保存建议"
            >
              <Save className="size-4" />
            </button>
          )}
          {editable && !editing && (
            <button
              className="inline-flex size-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100"
              type="button"
              onClick={() => setEditing(true)}
              title="修改建议"
            >
              <PencilLine className="size-4" />
            </button>
          )}
          {editable && (
            <button
              className="inline-flex size-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
              type="button"
              onClick={deleteNode}
              title="删除建议"
            >
              <Trash2 className="size-4" />
            </button>
          )}
        </div>
      </div>

      {editable && editing ? (
        <div className="pt-2">
          <textarea
            ref={textareaRef}
            className="min-h-16 w-full resize-y rounded-md border border-amber-200 bg-white px-3 py-2 leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            value={body}
            placeholder="输入编辑建议"
            onChange={(event) => persistSuggestionAttributes({ body: event.target.value })}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                saveSuggestion()
              }
            }}
          />
        </div>
      ) : (
        <p className="whitespace-pre-wrap pt-3 leading-7 text-amber-950/80">{attrs.body}</p>
      )}
    </NodeViewWrapper>
  )
}

export const EditSuggestion = TiptapNode.create({
  name: "editSuggestion",
  group: "block",
  atom: true,
  selectable: false,
  draggable: false,

  addAttributes() {
    return {
      id: { default: null },
      anchorBlockId: { default: null },
      position: { default: "after" },
      category: { default: "other" },
      body: { default: "" },
      createdBy: { default: null },
      createdAt: { default: null },
      updatedAt: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: "section[data-edit-suggestion]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "section",
      mergeAttributes(HTMLAttributes, {
        "data-edit-suggestion": "",
      }),
      ["strong", {}, "编辑建议"],
      ["p", {}, HTMLAttributes.body ?? ""],
    ]
  },

  addNodeView() {
    return ReactNodeViewRenderer(EditSuggestionView)
  },
})

export const ActiveBlock = Extension.create({
  name: "activeBlock",

  addProseMirrorPlugins() {
    const activeBlockKey = new PluginKey<boolean>("novel-active-block")

    return [
      new Plugin<boolean>({
        key: activeBlockKey,
        state: {
          init: () => false,
          apply(transaction, value) {
            const meta = transaction.getMeta(activeBlockKey)

            return typeof meta === "boolean" ? meta : value
          },
        },
        props: {
          decorations(state) {
            const focused = activeBlockKey.getState(state)
            const { $from } = state.selection

            if (!focused || $from.depth < 1) {
              return null
            }

            return DecorationSet.create(state.doc, [
              Decoration.node($from.before(1), $from.after(1), {
                class: "is-active-block",
              }),
            ])
          },
          handleDOMEvents: {
            focus: (view) => {
              view.dispatch(view.state.tr.setMeta(activeBlockKey, true))
              return false
            },
            blur: (view) => {
              view.dispatch(view.state.tr.setMeta(activeBlockKey, false))
              return false
            },
          },
        },
      }),
    ]
  },
})

export function setActiveDiscussion(editor: Editor, id: string | null) {
  const current = discussionHighlightKey.getState(editor.state)?.activeId ?? null

  if (current !== id) {
    editor.view.dispatch(editor.state.tr.setMeta(discussionHighlightKey, { activeId: id }))
  }
}

export const DiscussionHighlight = Extension.create({
  name: "discussionHighlight",

  addProseMirrorPlugins() {
    return [
      new Plugin<{ activeId: string | null }>({
        key: discussionHighlightKey,
        state: {
          init: () => ({ activeId: null }),
          apply(transaction, value) {
            return transaction.getMeta(discussionHighlightKey) ?? value
          },
        },
        props: {
          decorations(state) {
            const activeId = discussionHighlightKey.getState(state)?.activeId

            if (!activeId) {
              return null
            }

            const decorations: Decoration[] = []

            state.doc.descendants((node, pos) => {
              if (!node.isText) {
                return
              }

              const matched = node.marks.some(
                (mark) =>
                  (mark.type.name === "comment" || mark.type.name === "revision") &&
                  mark.attrs.id === activeId,
              )

              if (matched) {
                decorations.push(Decoration.inline(pos, pos + node.nodeSize, { class: "is-discussion-active" }))
              }
            })

            return DecorationSet.create(state.doc, decorations)
          },
        },
      }),
    ]
  },
})

const PlaceholderExtension = Placeholder.configure({
  placeholder: ({ node }) => (node.type.name === "heading" ? "输入标题" : "开始写作"),
  includeChildren: true,
})

const HighlightExtension = Highlight.configure({
  multicolor: true,
})

export function createNovelEditorExtensions(input: {
  trackChanges: boolean
  createdBy: NovelCreatedBy
}): Extensions {
  return [
    NovelDocument,
    NovelParagraph,
    NovelHeading.configure({ levels: [1, 2, 3] }),
    StarterKit.configure({
      document: false,
      paragraph: false,
      heading: false,
    }),
    // Tiptap 3 的 StarterKit 已经内置 underline；不能再注册同名独立扩展，
    // 否则 ProseMirror 会出现重复 extension name 警告，并可能让 command/plugin 状态相互覆盖。
    TextStyle,
    Color,
    HighlightExtension,
    CharacterCount,
    PlaceholderExtension,
    BlockId,
    ActiveBlock,
    CommentMark,
    RevisionMark.configure({
      enabled: input.trackChanges,
      createdBy: input.createdBy,
    }),
    EditSuggestion,
    DiscussionHighlight,
  ]
}

export function isRevisionTrackingEnabled(editor: Editor | null) {
  return Boolean(editor?.extensionManager.extensions.find((extension) => extension.name === "revision")?.options.enabled)
}

export function discussionButtonClass(active: boolean) {
  return cn(
    "inline-flex h-8 items-center justify-center rounded-md px-2 text-xs font-medium transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
    active ? "bg-primary/10 text-primary" : "text-muted-foreground",
  )
}
