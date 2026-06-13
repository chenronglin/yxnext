"use client"

import type { Editor } from "@tiptap/core"
import type { Mark as ProseMirrorMark } from "@tiptap/pm/model"
import { TextSelection } from "@tiptap/pm/state"
import type { EditorState, Transaction } from "@tiptap/pm/state"
import { MessageSquareText, Minus, PanelRightClose, Plus, Replace, Trash2 } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { setActiveDiscussion } from "@/components/doc/tiptap/extensions"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { cn } from "@/lib/utils"

type DiscussionSource = "comment" | "revision"

type DiscussionKind = "comment" | "insert" | "delete" | "replace"

type RevisionRole = "inserted" | "deleted" | "original"

type DiscussionSegment = {
  from: number
  to: number
  text: string
  role?: RevisionRole
}

type DiscussionItem = {
  key: string
  source: DiscussionSource
  id: string
  kind: DiscussionKind
  label: string
  from: number
  to: number
  quote: string
  body?: string
  originalText?: string
  insertedText?: string
  actorName?: string
  segments: DiscussionSegment[]
}

const MAX_QUOTE_LENGTH = 88

function asString(value: unknown) {
  return typeof value === "string" ? value : ""
}

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim()
}

function appendText(current: string, next: string) {
  const normalizedNext = normalizeText(next)

  if (!normalizedNext) {
    return current
  }

  return normalizeText(`${current}${current ? " " : ""}${normalizedNext}`)
}

function truncateText(text: string, fallback = "空内容") {
  const normalized = normalizeText(text)

  if (!normalized) {
    return fallback
  }

  return normalized.length > MAX_QUOTE_LENGTH ? `${normalized.slice(0, MAX_QUOTE_LENGTH)}...` : normalized
}

function keyFor(source: DiscussionSource, id: string) {
  return `${source}:${id}`
}

function getCreatedByName(mark: ProseMirrorMark) {
  const createdBy = mark.attrs.createdBy

  return createdBy && typeof createdBy === "object" && "nameSnapshot" in createdBy
    ? asString((createdBy as { nameSnapshot?: unknown }).nameSnapshot)
    : ""
}

function getRevisionKind(mark: ProseMirrorMark): DiscussionKind | null {
  if (mark.attrs.kind === "insert") return "insert"
  if (mark.attrs.kind === "delete") return "delete"
  if (mark.attrs.kind === "replace") return "replace"
  return null
}

function getRevisionLabel(kind: DiscussionKind) {
  if (kind === "insert") return "新增"
  if (kind === "delete") return "删除"
  if (kind === "replace") return "替换"
  return "批注"
}

function getOrCreateItem(itemsByKey: Map<string, DiscussionItem>, base: Omit<DiscussionItem, "quote" | "segments">) {
  const existing = itemsByKey.get(base.key)

  if (existing) {
    return existing
  }

  const item: DiscussionItem = {
    ...base,
    quote: "",
    segments: [],
  }

  itemsByKey.set(base.key, item)
  return item
}

function addSegment(item: DiscussionItem, segment: DiscussionSegment) {
  item.from = Math.min(item.from, segment.from)
  item.to = Math.max(item.to, segment.to)
  item.segments.push(segment)
}

function collectDiscussionItems(state: EditorState) {
  const itemsByKey = new Map<string, DiscussionItem>()

  // 右侧面板只承载批注和修订；编辑建议作为编辑区内的块级内容保留在正文画布中，避免和审核标记混在一起。
  state.doc.descendants((node, pos) => {
    if (!node.isText || !node.text) {
      return
    }

    const from = pos
    const to = pos + node.nodeSize
    const text = node.text

    node.marks.forEach((mark) => {
      const id = asString(mark.attrs.id)

      if (!id) {
        return
      }

      if (mark.type.name === "comment") {
        const item = getOrCreateItem(itemsByKey, {
          key: keyFor("comment", id),
          source: "comment",
          id,
          kind: "comment",
          label: "批注",
          from,
          to,
          body: asString(mark.attrs.body),
          actorName: getCreatedByName(mark),
        })

        item.quote = appendText(item.quote, text)
        addSegment(item, { from, to, text })
        return
      }

      if (mark.type.name !== "revision") {
        return
      }

      const kind = getRevisionKind(mark)
      const role = mark.attrs.role as RevisionRole | undefined

      if (!kind || (role !== "inserted" && role !== "deleted" && role !== "original")) {
        return
      }

      const item = getOrCreateItem(itemsByKey, {
        key: keyFor("revision", id),
        source: "revision",
        id,
        kind,
        label: getRevisionLabel(kind),
        from,
        to,
        originalText: "",
        insertedText: "",
        actorName: getCreatedByName(mark),
      })

      if (kind === "replace") {
        if (role === "original") {
          item.originalText = appendText(item.originalText ?? "", text)
        }

        if (role === "inserted") {
          item.insertedText = appendText(item.insertedText ?? "", text)
        }
      } else {
        item.quote = appendText(item.quote, text)
      }

      addSegment(item, { from, to, text, role })
    })
  })

  return Array.from(itemsByKey.values())
    .map((item) =>
      item.kind === "replace"
        ? {
            ...item,
            quote: `${truncateText(item.originalText ?? "")} -> ${truncateText(item.insertedText ?? "")}`,
          }
        : item,
    )
    .sort((a, b) => a.from - b.from)
}

function keyFromMarks(marks: readonly ProseMirrorMark[]) {
  const comment = marks.find((mark) => mark.type.name === "comment" && asString(mark.attrs.id))

  if (comment) {
    return keyFor("comment", asString(comment.attrs.id))
  }

  const revision = marks.find((mark) => mark.type.name === "revision" && asString(mark.attrs.id))

  return revision ? keyFor("revision", asString(revision.attrs.id)) : null
}

function getActiveKeyFromSelection(state: EditorState) {
  const { selection } = state

  if (selection.empty) {
    return (
      keyFromMarks(selection.$from.marks()) ??
      keyFromMarks(selection.$from.nodeBefore?.marks ?? []) ??
      keyFromMarks(selection.$from.nodeAfter?.marks ?? [])
    )
  }

  let activeKey: string | null = null

  state.doc.nodesBetween(selection.from, selection.to, (node) => {
    if (activeKey || !node.isText) {
      return false
    }

    activeKey = keyFromMarks(node.marks)
    return !activeKey
  })

  return activeKey
}

function selectDiscussionItem(editor: Editor, item: DiscussionItem) {
  const from = Math.max(0, Math.min(item.from, editor.state.doc.content.size))
  const to = Math.max(from, Math.min(item.to, editor.state.doc.content.size))

  if (from === to) {
    return
  }

  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)).scrollIntoView())
  editor.view.focus()
}

function removeDiscussionMark(editor: Editor, item: DiscussionItem) {
  const markName = item.source === "comment" ? "comment" : "revision"
  const tr = editor.state.tr
  let removed = false

  editor.state.doc.descendants((node, pos) => {
    if (!node.isText) {
      return
    }

    node.marks.forEach((mark) => {
      if (mark.type.name !== markName || asString(mark.attrs.id) !== item.id) {
        return
      }

      tr.removeMark(pos, pos + node.nodeSize, mark)
      removed = true
    })
  })

  if (removed) {
    editor.view.dispatch(tr.scrollIntoView())
    editor.view.focus()
  }
}

function itemTone(kind: DiscussionKind, active: boolean) {
  const base = "cursor-pointer rounded-lg border p-3 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring"

  if (active) {
    return cn(base, "border-primary/50 bg-primary/5 ring-1 ring-primary/25")
  }

  if (kind === "comment") return cn(base, "border-amber-200 bg-amber-50/45 hover:bg-amber-50")
  if (kind === "insert") return cn(base, "border-emerald-200 bg-emerald-50/45 hover:bg-emerald-50")
  if (kind === "delete") return cn(base, "border-red-200 bg-red-50/40 hover:bg-red-50")
  return cn(base, "border-orange-200 bg-orange-50/45 hover:bg-orange-50")
}

function badgeTone(kind: DiscussionKind) {
  if (kind === "comment") return "border-amber-200 bg-amber-100 text-amber-800"
  if (kind === "insert") return "border-emerald-200 bg-emerald-100 text-emerald-800"
  if (kind === "delete") return "border-red-200 bg-red-100 text-red-700"
  return "border-orange-200 bg-orange-100 text-orange-800"
}

function KindIcon({ kind }: { kind: DiscussionKind }) {
  const Icon = kind === "comment" ? MessageSquareText : kind === "insert" ? Plus : kind === "delete" ? Minus : Replace

  return <Icon className="size-3.5" />
}

export function DiscussionSidebar({ editor, onHide }: { editor: Editor | null; onHide?: () => void }) {
  const [items, setItems] = useState<DiscussionItem[]>([])
  const [activeKey, setActiveKey] = useState<string | null>(null)
  const cardRefs = useRef(new Map<string, HTMLElement>())
  const updateTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (!editor) {
      setItems([])
      setActiveKey(null)
      return
    }

    const currentEditor = editor

    function refreshAll() {
      setItems(collectDiscussionItems(currentEditor.state))
      setActiveKey(getActiveKeyFromSelection(currentEditor.state))
    }

    function scheduleRefresh() {
      if (updateTimer.current) {
        clearTimeout(updateTimer.current)
      }

      updateTimer.current = setTimeout(refreshAll, 160)
    }

    function handleTransaction({ transaction }: { transaction: Transaction }) {
      if (transaction.docChanged) {
        scheduleRefresh()
      } else {
        setActiveKey(getActiveKeyFromSelection(currentEditor.state))
      }
    }

    refreshAll()
    currentEditor.on("transaction", handleTransaction)

    return () => {
      currentEditor.off("transaction", handleTransaction)

      if (updateTimer.current) {
        clearTimeout(updateTimer.current)
      }

      setActiveDiscussion(currentEditor, null)
    }
  }, [editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    const activeItem = items.find((item) => item.key === activeKey)

    setActiveDiscussion(editor, activeItem?.id ?? null)
  }, [activeKey, editor, items])

  useEffect(() => {
    if (activeKey) {
      cardRefs.current.get(activeKey)?.scrollIntoView({ block: "nearest" })
    }
  }, [activeKey])

  const summary = useMemo(
    () => ({
      comments: items.filter((item) => item.kind === "comment").length,
      revisions: items.filter((item) => item.kind !== "comment").length,
    }),
    [items],
  )

  return (
    <Card className="sticky top-4 max-h-[calc(100vh-6rem)] gap-0 overflow-hidden p-0">
      <div className="flex items-start justify-between gap-3 border-b border-border px-4 py-3">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">批注修订</h2>
          <p className="mt-1 text-xs text-muted-foreground">
            {summary.comments} 条批注 · {summary.revisions} 条修订
          </p>
        </div>
        {/* 右栏只负责发出隐藏请求，真正的布局扩展由父级 DocEditor 统一控制。 */}
        {onHide && (
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="-mr-1 size-8 shrink-0"
            title="隐藏批注区"
            aria-label="隐藏批注区"
            onClick={onHide}
          >
            <PanelRightClose className="size-4" />
          </Button>
        )}
      </div>

      <div className="max-h-[calc(100vh-12rem)] overflow-y-auto p-3">
        {items.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border p-5 text-center text-sm leading-6 text-muted-foreground">
            暂无批注或修订。
          </div>
        ) : (
          <div className="grid gap-2.5">
            {items.map((item) => {
              const active = item.key === activeKey

              return (
                <article
                  key={item.key}
                  ref={(node) => {
                    if (node) {
                      cardRefs.current.set(item.key, node)
                    } else {
                      cardRefs.current.delete(item.key)
                    }
                  }}
                  aria-current={active ? "true" : undefined}
                  className={itemTone(item.kind, active)}
                  role="button"
                  tabIndex={0}
                  onClick={() => editor && selectDiscussionItem(editor, item)}
                  onKeyDown={(event) => {
                    if (!editor || (event.key !== "Enter" && event.key !== " ")) {
                      return
                    }

                    event.preventDefault()
                    selectDiscussionItem(editor, item)
                  }}
                >
                  <div className="flex items-start justify-between gap-2">
                    <span className={cn("inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs", badgeTone(item.kind))}>
                      <KindIcon kind={item.kind} />
                      {item.label}
                    </span>
                    <button
                      className="inline-flex size-7 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-red-50 hover:text-red-600"
                      type="button"
                      title="删除标记"
                      onClick={(event) => {
                        event.stopPropagation()

                        if (editor) {
                          removeDiscussionMark(editor, item)
                        }
                      }}
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  <blockquote className="mt-2 border-l-2 border-foreground/15 pl-2 text-sm leading-6 text-muted-foreground">
                    “{truncateText(item.quote)}”
                  </blockquote>
                  {item.body && <p className="mt-2 text-sm leading-6 text-foreground/90">{item.body}</p>}
                  {item.kind === "replace" && (
                    <div className="mt-2 grid gap-1 text-xs leading-5">
                      <p className="text-orange-700">原文：{truncateText(item.originalText ?? "")}</p>
                      <p className="text-emerald-700">替换：{truncateText(item.insertedText ?? "")}</p>
                    </div>
                  )}
                  {item.actorName && <p className="mt-2 text-xs text-muted-foreground">由 {item.actorName} 创建</p>}
                </article>
              )
            })}
          </div>
        )}
      </div>
    </Card>
  )
}
