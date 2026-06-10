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
import type { Mark as ProseMirrorMark, Slice } from "@tiptap/pm/model"
import { Plugin, PluginKey, TextSelection } from "@tiptap/pm/state"
import type { EditorState, Selection, Transaction } from "@tiptap/pm/state"
import { Decoration, DecorationSet, type EditorView } from "@tiptap/pm/view"
import { NodeViewWrapper, ReactNodeViewRenderer } from "@tiptap/react"
import type { ReactNodeViewProps } from "@tiptap/react"
import { Check, PencilLine, Trash2 } from "lucide-react"
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

    const originalFrom = tr.mapping.map(range.from, 1)
    const originalTo = tr.mapping.map(range.to, 1)

    tr.addMark(originalFrom, originalTo, originalMark)
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

function markDeletedRange(
  state: EditorState,
  range: TextRange,
  options: RevisionTrackingOptions,
  dispatch?: (tr: Transaction) => void,
) {
  if (!options.enabled || range.from === range.to || !rangeContainsText(state, range)) {
    return false
  }

  const pluginState = revisionTrackingKey.getState(state)
  const canReuseLastRevision = Boolean(pluginState?.lastId && (range.from === pluginState.lastPos || range.to === pluginState.lastPos))
  const attrs = makeRevisionAttrs(
    options,
    "delete",
    "deleted",
    canReuseLastRevision ? pluginState?.lastGroupId : undefined,
    canReuseLastRevision ? pluginState?.lastId : undefined,
  )
  const mark = createRevisionMark(state, attrs)

  if (!mark) {
    return false
  }

  const tr = state.tr.addMark(range.from, range.to, mark)

  tr.setSelection(TextSelection.create(tr.doc, range.from))
  tr.setMeta(revisionTrackingKey, {
    id: attrs.id,
    groupId: attrs.groupId,
    kind: "delete",
    role: "deleted",
    from: range.from,
    to: range.to,
  } satisfies RevisionPluginMeta)
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

export function finalizeComposition(view: EditorView, base: CompositionBase, options: RevisionTrackingOptions) {
  const { state } = view
  const insertedRange = normalizeRange(state, base.from, state.selection.from)

  if (!options.enabled || insertedRange.from === insertedRange.to) {
    return
  }

  if (base.existingInsertedAttrs) {
    const insertedMark = createRevisionMark(state, base.existingInsertedAttrs)

    if (!insertedMark) {
      return
    }

    const tr = state.tr.addMark(insertedRange.from, insertedRange.to, insertedMark)
    const cursorPos = insertedRange.to

    tr.setSelection(TextSelection.create(tr.doc, cursorPos))
    tr.setMeta(revisionTrackingKey, {
      id: base.existingInsertedAttrs.id,
      groupId: base.existingInsertedAttrs.groupId,
      kind: base.existingInsertedAttrs.kind,
      role: "inserted",
      from: insertedRange.from,
      to: cursorPos,
      composition: true,
    } satisfies RevisionPluginMeta)
    view.dispatch(tr.scrollIntoView())
    return
  }

  const isReplacement = base.from !== base.to
  const insertedAttrs = resolveInsertedRevision(state, insertedRange.from, options, !isReplacement, isReplacement)
  const insertedKind = insertedAttrs.kind
  const insertedMark = createRevisionMark(state, insertedAttrs)

  if (!insertedMark) {
    return
  }

  const tr = state.tr.addMark(insertedRange.from, insertedRange.to, insertedMark)

  if (isReplacement && base.slice.size > 0) {
    const originalMark = createRevisionMark(state, makeOriginalRevisionAttrs(insertedAttrs))

    if (!originalMark) {
      return
    }

    const originalFrom = insertedRange.to
    const originalTo = originalFrom + base.slice.size

    tr.replace(originalFrom, originalFrom, base.slice)
    tr.addMark(originalFrom, originalTo, originalMark)
  }

  const cursorPos = insertedRange.to

  tr.setSelection(TextSelection.create(tr.doc, cursorPos))
  tr.setMeta(revisionTrackingKey, {
    id: insertedAttrs.id,
    groupId: insertedAttrs.groupId,
    kind: insertedKind,
    role: "inserted",
    from: insertedRange.from,
    to: cursorPos,
    composition: true,
  } satisfies RevisionPluginMeta)
  view.dispatch(tr.scrollIntoView())
}

// 输入法（composition）状态机：每个编辑器实例独享一份闭包状态。
// 抽成工厂有两个目的：一是让 handleTextInput/handlePaste 能共享同一个 isComposing 标志；
// 二是把“连打丢失修订”的修复逻辑收敛到一处，并可在单测里用假定时器直接驱动验证。
export function createRevisionCompositionController(getOptions: () => RevisionTrackingOptions) {
  let isComposing = false
  let compositionBase: CompositionBase | null = null
  let compositionTimer: ReturnType<typeof setTimeout> | null = null

  function flushPendingComposition(view: EditorView) {
    if (!compositionTimer) {
      return
    }

    // IME 连打时，上一段 compositionend 排进 setTimeout 的 finalize 可能还没执行。
    // 旧逻辑在 compositionstart 里直接 clearTimeout 丢弃它，导致上一段输入永远不被标记成修订
    // （表现为“在新增/替换区域继续输入会丢失之前的修订”）。这里改为先把上一段补打上再开始新一段：
    // 此刻新 composition 尚未输入字符，文档与选区仍停在上一段末尾，finalizeComposition 的范围计算依旧准确。
    clearTimeout(compositionTimer)
    compositionTimer = null

    if (compositionBase) {
      finalizeComposition(view, compositionBase, getOptions())
      compositionBase = null
    }
  }

  return {
    // handleTextInput/handlePaste 用它判断是否处在输入法会话中（此时不能再走直接插入路径）。
    isActive() {
      return isComposing
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
        ...range,
        slice: view.state.doc.slice(range.from, range.to),
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
      compositionTimer = setTimeout(() => {
        isComposing = false
        compositionTimer = null
        finalizeComposition(view, base, options)

        if (compositionBase === base) {
          compositionBase = null
        }
      }, 0)

      return false
    },
  }
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
      id: { default: null },
      kind: { default: "normal" },
      body: { default: "" },
      createdBy: { default: null },
      createdAt: { default: null },
      updatedAt: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-comment-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-comment-id": HTMLAttributes.id,
        "data-comment-kind": HTMLAttributes.kind,
        title: HTMLAttributes.body,
      }),
      0,
    ]
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
      id: { default: null },
      groupId: { default: null },
      kind: { default: null },
      role: { default: null },
      createdBy: { default: null },
      createdAt: { default: null },
    }
  },

  parseHTML() {
    return [{ tag: "span[data-revision-id]" }]
  },

  renderHTML({ HTMLAttributes }) {
    return [
      "span",
      mergeAttributes(HTMLAttributes, {
        "data-revision-id": HTMLAttributes.id,
        "data-revision-group-id": HTMLAttributes.groupId,
        "data-revision-kind": HTMLAttributes.kind,
        "data-revision-role": HTMLAttributes.role,
      }),
      0,
    ]
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
        state: {
          init: () => ({ lastId: null, lastGroupId: null, lastPos: null }),
          apply(transaction, value, _oldState, newState) {
            if (transaction.selectionSet && !transaction.docChanged && !transaction.getMeta(revisionTrackingKey)) {
              return { lastId: null, lastGroupId: null, lastPos: null }
            }

            const meta = transaction.getMeta(revisionTrackingKey) as RevisionPluginMeta | undefined

            if (meta?.id) {
              return {
                lastId: meta.id,
                lastGroupId: meta.groupId,
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
            if (composition.isActive() || view.composing) {
              return false
            }

            return applyInsertedText(view, text, normalizeRange(view.state, from, to), this.options)
          },
          handlePaste: (view, event) => {
            if (composition.isActive() || view.composing) {
              return false
            }

            const text = plainTextFromClipboard(event)

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

            const { state } = view
            const range = rangeFromSelection(state, state.selection)
            const targetRange =
              range.from !== range.to
                ? range
                : event.key === "Backspace"
                  ? normalizeRange(state, state.selection.from - 1, state.selection.from)
                  : normalizeRange(state, state.selection.from, state.selection.from + 1)

            return markDeletedRange(state, targetRange, this.options, view.dispatch)
          },
          handleDOMEvents: {
            compositionstart: (view) => composition.handleCompositionStart(view),
            compositionend: (view) => composition.handleCompositionEnd(view),
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
      textareaRef.current?.focus()
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

  return (
    <NodeViewWrapper
      as="section"
      className="my-5 rounded-lg border border-amber-200 bg-amber-50/80 p-4 text-sm shadow-xs"
      contentEditable={false}
      data-edit-suggestion-card=""
    >
      <div className="flex items-center justify-between gap-3 border-b border-amber-200/70 pb-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="font-medium text-amber-800">编辑建议</span>
          <span className="truncate text-xs text-amber-700/75">{attrs.createdBy?.nameSnapshot ?? "未知用户"}</span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
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
        <div className="pt-3">
          <select
            className="mb-2 h-8 rounded-md border border-amber-200 bg-white px-2 text-xs text-amber-900 outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            value={category}
            onChange={(event) => setCategory(event.target.value as NovelSuggestionCategory)}
          >
            <option value="structure">结构</option>
            <option value="logic">逻辑</option>
            <option value="rhythm">节奏</option>
            <option value="expression">表达</option>
            <option value="plot">情节</option>
            <option value="character">角色</option>
            <option value="worldbuilding">设定</option>
            <option value="continuity">连续性</option>
            <option value="other">其他</option>
          </select>
          <textarea
            ref={textareaRef}
            className="min-h-24 w-full resize-y rounded-md border border-amber-200 bg-white px-3 py-2 leading-6 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-amber-300"
            value={body}
            placeholder="输入编辑建议"
            onChange={(event) => setBody(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                saveSuggestion()
              }
            }}
          />
          <div className="mt-3 flex justify-end">
            <button
              className="inline-flex h-8 items-center gap-1 rounded-md bg-amber-500 px-3 text-sm font-medium text-white hover:bg-amber-600 disabled:cursor-not-allowed disabled:opacity-60"
              type="button"
              disabled={!body.trim()}
              onClick={saveSuggestion}
            >
              <Check className="size-4" />
              保存建议
            </button>
          </div>
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
