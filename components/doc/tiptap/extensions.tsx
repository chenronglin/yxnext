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
import Underline from "@tiptap/extension-underline"
import StarterKit from "@tiptap/starter-kit"
import { Fragment, Slice, type Mark as ProseMirrorMark, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state"
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
  lastId: string | null
  lastGroupId: string | null
  lastKind: NovelRevisionKind | null
  lastPos: number | null
}

type RevisionPluginMeta = {
  id: string
  groupId: string
  kind: NovelRevisionKind
  role: NovelRevisionRole
  from: number
  to: number
  composition?: boolean
}

type TextRange = {
  from: number
  to: number
}

type CompositionBase = TextRange & {
  slice: Slice
  existingInsertedAttrs: RevisionAttributes | null
  // 记录 compositionstart 时的文档尺寸，compositionend 延迟补标时用它反推本次 IME 插入长度。
  docContentSize: number
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
  flushPendingFinalize: (view: EditorView) => boolean
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

function rangeContainsCommentMark(state: EditorState, range: TextRange) {
  let hasComment = false

  state.doc.nodesBetween(range.from, range.to, (node) => {
    if (!node.isText) {
      return true
    }

    hasComment = node.marks.some((mark) => mark.type.name === "comment")
    return !hasComment
  })

  return hasComment
}

function collectRevisionTextSegments(state: EditorState, range: TextRange) {
  const segments: { from: number; to: number; isInserted: boolean }[] = []

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
        isInserted: node.marks.some(isInsertedRevisionMark),
      })
    }

    return true
  })

  return segments
}

function filterInsertedTextNode(node: ProseMirrorNode): ProseMirrorNode | null {
  if (node.isText) {
    return node.marks.some(isInsertedRevisionMark) ? null : node
  }

  if (node.isLeaf) {
    return node
  }

  const children: ProseMirrorNode[] = []
  node.content.forEach((child) => {
    const next = filterInsertedTextNode(child)

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

function stripInsertedTextFromSlice(slice: Slice) {
  const children: ProseMirrorNode[] = []

  slice.content.forEach((node) => {
    const next = filterInsertedTextNode(node)

    if (next) {
      children.push(next)
    }
  })

  return new Slice(Fragment.fromArray(children), slice.openStart, slice.openEnd)
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

function forwardDeleteRangeSkippingDeletedText(state: EditorState, pos: number) {
  let from = clampPosition(state, pos)

  while (from < state.doc.content.size) {
    const nodeAfter = state.doc.resolve(from).nodeAfter

    // Delete 连按时应越过已经标删的文字；否则光标一直卡在同一个 deleted 字符前。
    if (nodeAfter?.isText && nodeAfter.marks.some(isDeletedRevisionMark)) {
      from += nodeAfter.nodeSize
      continue
    }

    break
  }

  return normalizeRange(state, from, from + 1)
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

export function findInsertedRevisionCoveringRange(state: EditorState, range: TextRange) {
  if (range.from === range.to) {
    return findInsertedRevisionAtPosition(state, range.from)
  }

  let insertedAttrs: RevisionAttributes | null = null
  let hasText = false
  let coveredBySameRevision = true

  state.doc.nodesBetween(range.from, range.to, (node) => {
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
  inputOptions: { allowMerge: boolean; forceReplace?: boolean } = { allowMerge: true },
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

  const isReplacement = inputOptions.forceReplace === true || range.from !== range.to
  const insertedAttrs = resolveInsertedRevision(state, range.from, options, !isReplacement && inputOptions.allowMerge, isReplacement)
  const insertedKind = insertedAttrs.kind
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return false
  }

  const tr = state.tr
  const textNode = createMarkedText(state, text, insertedMark)

  tr.insert(range.from, textNode)

  const insertedTo = range.from + textNode.nodeSize

  if (isReplacement && rangeContainsText(state, range)) {
    const originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

    if (!originalMark) {
      return false
    }

    const originalSegments = collectRevisionTextSegments(state, range)

    // 替换选区可能混有 inserted 文本；这些文字从未存在于底稿，不能被标成 original。
    for (let i = originalSegments.length - 1; i >= 0; i--) {
      const segment = originalSegments[i]
      const originalFrom = tr.mapping.map(segment.from, 1)
      const originalTo = tr.mapping.map(segment.to, 1)

      if (segment.isInserted) {
        tr.delete(originalFrom, originalTo)
      } else {
        tr.addMark(originalFrom, originalTo, originalMark)
      }
    }
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
  let lastId = pluginState?.lastId
  let lastGroupId = pluginState?.lastGroupId
  let lastPos = pluginState?.lastPos
  const lastKind = pluginState?.lastKind
  const operationGroupId = createPrefixedId("revision_group")

  let hasChanges = false
  let lastMarkedAttrs: RevisionAttributes | null = null

  // 从右向左处理，避免删除文本导致左侧未处理区段的 position 偏移失效
  for (let i = segments.length - 1; i >= 0; i--) {
    const { from, to, isInserted } = segments[i]
    if (isInserted) {
      tr.delete(from, to)
      hasChanges = true
    } else {
      const canReuseLastRevision = Boolean(lastKind === "delete" && lastId && (from === lastPos || to === lastPos))
      const attrs = makeRevisionAttrs(
        options,
        "delete",
        "deleted",
        canReuseLastRevision ? lastGroupId : operationGroupId,
        canReuseLastRevision ? lastId : undefined,
      )
      const mark = createRevisionMark(state, attrs)
      if (mark) {
        tr.addMark(from, to, mark)
        lastId = attrs.id
        lastGroupId = attrs.groupId
        lastPos = from
        lastMarkedAttrs = attrs
        hasChanges = true
      }
    }
  }

  if (!hasChanges) {
    return false
  }

  const resolvedFrom = tr.mapping.map(range.from)
  const resolvedTo = tr.mapping.map(range.to)
  tr.setSelection(TextSelection.create(tr.doc, selectionSide === "end" ? resolvedTo : resolvedFrom))

  if (lastMarkedAttrs) {
    tr.setMeta(revisionTrackingKey, {
      id: lastMarkedAttrs.id,
      groupId: lastMarkedAttrs.groupId,
      kind: "delete",
      role: "deleted",
      from: resolvedFrom,
      to: tr.mapping.map(range.to),
    } satisfies RevisionPluginMeta)
  }

  dispatch?.(tr.scrollIntoView())
  return true
}

function plainTextFromClipboard(event: ClipboardEvent) {
  if (!event.clipboardData || event.clipboardData.files.length > 0) {
    return null
  }

  return event.clipboardData.getData("text/plain")
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

function insertedRangeFromCompositionBase(state: EditorState, base: CompositionBase) {
  const replacedSize = Math.max(0, base.to - base.from)
  const insertedSize = state.doc.content.size - base.docContentSize + replacedSize

  // compositionend 后可能先发生点击、侧栏定位等选区事务；这些事务不会改变文档大小。
  // 因此这里用“当前文档大小 - composition 开始时文档大小 + 被替换区间大小”
  // 反推 IME 本次真正插入了多少内容，而不是读取已经可能变化的 state.selection。
  return normalizeRange(state, base.from, base.from + Math.max(0, insertedSize))
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

export function finalizeComposition(view: EditorView, base: CompositionBase, options: RevisionTrackingOptions) {
  const { state } = view
  const insertedRange = insertedRangeFromCompositionBase(state, base)

  if (!options.enabled || insertedRange.from === insertedRange.to) {
    return false
  }

  if (base.existingInsertedAttrs) {
    const insertedMark = createRevisionMark(state, base.existingInsertedAttrs)

    if (!insertedMark) {
      return false
    }

    const tr = state.tr.addMark(insertedRange.from, insertedRange.to, insertedMark)
    const cursorPos = insertedRange.to

    preserveOrSetCompositionSelection(state, tr, insertedRange, cursorPos)
    tr.setMeta(revisionTrackingKey, {
      id: base.existingInsertedAttrs.id,
      groupId: base.existingInsertedAttrs.groupId,
      kind: base.existingInsertedAttrs.kind,
      role: "inserted",
      from: insertedRange.from,
      to: cursorPos,
      composition: true,
    } satisfies RevisionPluginMeta)
    view.dispatch(tr)
    return true
  }

  const isReplacement = base.from !== base.to
  const insertedAttrs = resolveInsertedRevision(state, insertedRange.from, options, !isReplacement, isReplacement)
  const insertedKind = insertedAttrs.kind
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return false
  }

  const tr = state.tr.addMark(insertedRange.from, insertedRange.to, insertedMark)

  const originalSlice = isReplacement && base.slice.size > 0 ? stripInsertedTextFromSlice(base.slice) : null

  if (originalSlice && originalSlice.size > 0) {
    const originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

    if (!originalMark) {
      return false
    }

    const originalFrom = insertedRange.to
    const originalTo = originalFrom + originalSlice.size

    tr.replace(originalFrom, originalFrom, originalSlice)
    tr.addMark(originalFrom, originalTo, originalMark)
  }

  const cursorPos = insertedRange.to

  preserveOrSetCompositionSelection(state, tr, insertedRange, cursorPos)
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedKind,
    role: "inserted",
    from: insertedRange.from,
    to: cursorPos,
    composition: true,
  } satisfies RevisionPluginMeta)
  view.dispatch(tr)
  return true
}

// 输入法（composition）状态机：每个编辑器实例独享一份闭包状态。
// 抽成工厂有两个目的：一是让 handleTextInput/handlePaste 能共享同一个 isComposing 标志；
// 二是把“连打丢失修订”的修复逻辑收敛到一处，并可在单测里用假定时器直接驱动验证。
export function createRevisionCompositionController(getOptions: () => RevisionTrackingOptions) {
  let isComposing = false
  let compositionBase: CompositionBase | null = null
  let compositionTimer: ReturnType<typeof setTimeout> | null = null

  function flushPendingComposition(view: EditorView) {
    if (!compositionTimer || !compositionBase) {
      return false
    }

    // IME 连打时，上一段 compositionend 排进 setTimeout 的 finalize 可能还没执行。
    // 旧逻辑在 compositionstart 里直接 clearTimeout 丢弃它，导致上一段输入永远不被标记成修订
    // （表现为“在新增/替换区域继续输入会丢失之前的修订”）。这里改为先把上一段补打上再开始新一段：
    // 此刻新 composition 尚未输入字符，文档与选区仍停在上一段末尾，finalizeComposition 的范围计算依旧准确。
    clearTimeout(compositionTimer)
    compositionTimer = null

    const finalized = finalizeComposition(view, compositionBase, getOptions())

    compositionBase = null
    return finalized
  }

  const runtime: RevisionCompositionRuntime = {
    // handleTextInput/handlePaste 用它判断是否处在输入法会话中（此时不能再走直接插入路径）。
    isComposing() {
      return isComposing
    },
    hasPendingFinalize() {
      return Boolean(compositionTimer && compositionBase)
    },
    flushPendingFinalize(view: EditorView) {
      return flushPendingComposition(view)
    },
  }

  return {
    ...runtime,
    handleCompositionStart(view: EditorView) {
      const options = getOptions()

      if (!options.enabled) {
        return false
      }

      flushPendingComposition(view)

      const range = captureRange(view)

      isComposing = true
      compositionBase = {
        ...range,
        slice: view.state.doc.slice(range.from, range.to),
        docContentSize: view.state.doc.content.size,
        // compositionend 发生时文档已被浏览器改写，必须在开始时记录是否处在已有 inserted 修订内。
        existingInsertedAttrs: findInsertedRevisionCoveringRange(view.state, range),
      }

      return false
    },
    handleCompositionEnd(view: EditorView) {
      const options = getOptions()

      if (!options.enabled || !compositionBase) {
        isComposing = false
        return false
      }

      const base = compositionBase

      // 仍用 setTimeout(0) 等浏览器把 composition 的最终文本同步进 ProseMirror，再据此计算插入范围。
      // 与旧逻辑的区别在于：若下一段输入在它执行前到来，会由 flushPendingComposition 先行补打，而不是被丢弃。
      isComposing = false
      compositionTimer = setTimeout(() => {
        compositionTimer = null
        finalizeComposition(view, base, options)

        if (compositionBase === base) {
          compositionBase = null
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

  return runtime?.flushPendingFinalize(editor.view) ?? false
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

export const BlockId = Extension.create({
  name: "blockId",

  addProseMirrorPlugins() {
    return [
      new Plugin({
        appendTransaction(transactions, _oldState, newState) {
          if (!transactions.some((transaction) => transaction.docChanged)) {
            return null
          }

          const tr = newState.tr
          let changed = false

          newState.doc.descendants((node, pos) => {
            if (node.type.name !== "paragraph" && node.type.name !== "heading") {
              return true
            }

            if (typeof node.attrs.id === "string" && node.attrs.id) {
              return true
            }

            const id = node.type.name === "heading" ? createNovelBlockId("h") : createNovelBlockId("p")

            tr.setNodeMarkup(pos, undefined, { ...node.attrs, id })
            changed = true
            return true
          })

          return changed ? tr : null
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
          init: () => ({ lastId: null, lastGroupId: null, lastKind: null, lastPos: null }),
          apply(transaction, value, _oldState, newState) {
            if (transaction.selectionSet && !transaction.docChanged && !transaction.getMeta(revisionTrackingKey)) {
              return { lastId: null, lastGroupId: null, lastKind: null, lastPos: null }
            }

            const meta = transaction.getMeta(revisionTrackingKey) as RevisionPluginMeta | undefined

            if (meta?.id) {
              return {
                lastId: meta.id,
                lastGroupId: meta.groupId,
                lastKind: meta.kind,
                lastPos: meta.kind === "delete" ? meta.from : meta.to,
              }
            }

            if (transaction.docChanged) {
              return { ...value, lastPos: newState.selection.from }
            }

            return value
          },
        },
        props: {
          handleTextInput: (view, from, to, text) => {
            if (composition.isComposing() || view.composing) {
              return false
            }

            // 直接输入可能紧跟在中文输入法 compositionend 后面到来；
            // 先补完上一段 IME 文本的修订标记，再按新的输入事件继续处理。
            composition.flushPendingFinalize(view)

            if (!this.options.enabled) {
              return applyPlainTextWithoutRevision(view, text, normalizeRange(view.state, from, to))
            }

            return applyInsertedText(view, text, normalizeRange(view.state, from, to), this.options)
          },
          handlePaste: (view, event) => {
            if (composition.isComposing() || view.composing) {
              return false
            }

            // 粘贴也可能发生在 IME 补标计时器之前；这里先收口上一段输入，避免粘贴内容和上一段无标记文本混在一起。
            composition.flushPendingFinalize(view)

            const text = plainTextFromClipboard(event)

            if (!this.options.enabled) {
              return text ? applyPlainTextWithoutRevision(view, text, rangeFromSelection(view.state, view.state.selection)) : false
            }

            return text
              ? applyInsertedText(view, text, rangeFromSelection(view.state, view.state.selection), this.options, {
                  allowMerge: false,
                })
              : false
          },
          handleKeyDown: (view, event) => {
            if (!this.options.enabled || (event.key !== "Backspace" && event.key !== "Delete")) {
              return false
            }

            if (composition.isComposing() || view.composing) {
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
                  ? normalizeRange(state, state.selection.from - 1, state.selection.from)
              : forwardDeleteRangeSkippingDeletedText(state, state.selection.from)

            if (range.from !== range.to && rangeContainsCommentMark(state, targetRange)) {
              // 批注锚点如果随正文删除，会让右侧讨论栏失去定位；这里先要求用户确认，避免误删批注语义。
              const confirmed = window.confirm("选中内容包含批注标记，删除会一并移除批注定位。确认继续吗？")

              if (!confirmed) {
                event.preventDefault()
                return true
              }
            }

            return markDeletedRange(state, targetRange, this.options, view.dispatch, event.key === "Delete" ? "end" : "start")
          },
          handleDOMEvents: {
            compositionstart: (view) => composition.handleCompositionStart(view),
            compositionend: (view) => composition.handleCompositionEnd(view),
            mousedown: (view) => {
              // 鼠标点击会先改变 DOM 选区，再触发 ProseMirror 选区事务；
              // 在点击前补完 pending composition，可以避免异步补标把范围算到用户刚点击的其它段落。
              if (!composition.isComposing() && !view.composing) {
                composition.flushPendingFinalize(view)
              }

              return false
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

function EditSuggestionView({ node, updateAttributes, deleteNode }: ReactNodeViewProps) {
  const attrs = node.attrs as EditSuggestionAttrs
  const [body, setBody] = useState(attrs.body ?? "")
  const [category, setCategory] = useState<NovelSuggestionCategory>((attrs.category as NovelSuggestionCategory) ?? "other")
  const [editing, setEditing] = useState(!attrs.body)
  const textareaRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    if (editing) {
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
  }, [editing])

  function saveSuggestion() {
    const nextBody = body.trim()

    if (!nextBody) {
      return
    }

    updateAttributes({
      body: nextBody,
      category,
      updatedAt: new Date().toISOString(),
    })
    setEditing(false)
  }

  const categoryOptions: Array<{ value: NovelSuggestionCategory; label: string }> = [
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
            {editing ? (
              categoryOptions.map((option) => {
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
                    onClick={() => setCategory(option.value)}
                  >
                    {option.label}
                  </button>
                )
              })
            ) : (
              <span className="inline-flex h-6 items-center rounded-md border border-amber-200 bg-amber-100 px-2 text-[11px] font-medium text-amber-800">
                {categoryOptions.find((option) => option.value === category)?.label ?? "其他"}
              </span>
            )}
          </div>
          <span className="truncate text-xs text-amber-700/75">{attrs.createdBy?.nameSnapshot ?? "未知用户"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {editing && (
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
          {!editing && (
            <button
              className="inline-flex size-7 items-center justify-center rounded-md text-amber-700 hover:bg-amber-100"
              type="button"
              onClick={() => setEditing(true)}
              title="修改建议"
            >
              <PencilLine className="size-4" />
            </button>
          )}
          <button
            className="inline-flex size-7 items-center justify-center rounded-md text-red-500 hover:bg-red-50"
            type="button"
            onClick={deleteNode}
            title="删除建议"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>

      {editing ? (
        <div className="pt-2">
          <textarea
            ref={textareaRef}
            className="min-h-16 w-full resize-y rounded-md border border-amber-200 bg-white px-3 py-2 leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            value={body}
            placeholder="输入编辑建议"
            onChange={(event) => setBody(event.target.value)}
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
    Underline,
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
