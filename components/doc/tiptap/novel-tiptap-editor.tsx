"use client"

import { EditorContent, useEditor } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/core"
import { Bold, ChevronDown, Eraser, Heading1, Heading2, Heading3, Italic, MessageSquarePlus, Palette, Pilcrow, Quote, Save, Strikethrough, Trash2, UnderlineIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import { addCommentToRange, createNovelEditorExtensions, insertEditSuggestionAfterSelection, isRevisionTrackingEnabled } from "@/components/doc/tiptap/extensions"
import { Button } from "@/components/ui/button"
import {
  deriveNovelDocProjection,
  type NovelCreatedBy,
  type NovelDocJson,
  type NovelDocProjection,
} from "@/lib/novel-doc"
import { cn } from "@/lib/utils"

export type SaveState = "idle" | "dirty" | "saving" | "saved" | "error" | "conflict" | "readonly"

type NovelTiptapEditorProps = {
  value: NovelDocJson
  editable: boolean
  trackChanges: boolean
  createdBy: NovelCreatedBy
  saveState: SaveState
  // 由页面层注入高度约束；编辑器自身只负责撑满容器，避免不同页面复用时互相影响。
  className?: string
  // 同一个只读状态在当前稿件和历史版本中含义不同，允许调用方覆盖状态文案。
  readonlyLabel?: string
  onChange: (json: NovelDocJson, projection: NovelDocProjection) => void
  onReady?: (editor: Editor | null) => void
}

type PendingComment = {
  from: number
  to: number
}

const DEFAULT_TEXT_COLOR = "#2563eb"

const TEXT_COLOR_OPTIONS = [
  { label: "蓝色", value: DEFAULT_TEXT_COLOR },
  { label: "红色", value: "#dc2626" },
  { label: "绿色", value: "#16a34a" },
  { label: "橙色", value: "#ea580c" },
  { label: "紫色", value: "#9333ea" },
] as const

function stringifyContent(value: NovelDocJson) {
  // 受控 value 只用于判断外部内容是否真的变化，避免 setContent 打断用户光标。
  return JSON.stringify(value)
}

function statusLabel(saveState: SaveState, readonlyLabel?: string) {
  if (saveState === "dirty") return "未保存"
  if (saveState === "saving") return "保存中"
  if (saveState === "saved") return "已保存"
  if (saveState === "error") return "保存失败"
  if (saveState === "conflict") return "保存冲突"
  if (saveState === "readonly") return readonlyLabel ?? "当前内容只读，等待作者提交新版本"
  return "待编辑"
}

function statusTone(saveState: SaveState) {
  if (saveState === "dirty") return "border-amber-200 bg-amber-50 text-amber-700"
  if (saveState === "saving") return "border-blue-200 bg-blue-50 text-blue-700"
  if (saveState === "saved") return "border-emerald-200 bg-emerald-50 text-emerald-700"
  if (saveState === "error" || saveState === "conflict") return "border-red-200 bg-red-50 text-red-600"
  return "border-border bg-muted text-muted-foreground"
}

function ToolbarButton({
  active,
  title,
  children,
  onClick,
}: {
  active?: boolean
  title: string
  children: React.ReactNode
  onClick: () => void
}) {
  return (
    <button
      className={cn(
        "inline-flex size-8 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary/10 text-primary",
      )}
      type="button"
      title={title}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {children}
    </button>
  )
}

function SelectionBubble({
  editor,
  createdBy,
}: {
  editor: Editor
  createdBy: NovelCreatedBy
}) {
  const [pendingComment, setPendingComment] = useState<PendingComment | null>(null)
  const [commentDraft, setCommentDraft] = useState("")
  const [colorMenuOpen, setColorMenuOpen] = useState(false)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const revisionTracking = isRevisionTrackingEnabled(editor)
  const activeTextColor = editor.getAttributes("textStyle").color
  const selectedTextColor = typeof activeTextColor === "string" ? activeTextColor : null

  useEffect(() => {
    if (pendingComment) {
      textareaRef.current?.focus()
    }
  }, [pendingComment])

  function closeCommentDialog() {
    setPendingComment(null)
    setCommentDraft("")
  }

  function saveComment() {
    if (!pendingComment || !commentDraft.trim()) {
      return
    }

    const saved = addCommentToRange(editor, {
      ...pendingComment,
      body: commentDraft,
      createdBy,
    })

    if (saved) {
      closeCommentDialog()
    }
  }

  function applyTextColor(color: string) {
    // 标色属于正文排版信息，不是协作讨论信息；这里写入 Tiptap 的 textStyle/color mark。
    // 自动保存会把完整 contentJson 落库，因此颜色会随文档保存；右侧批注区只扫描 comment/revision mark，
    // 不会把这种普通格式 mark 渲染成批注或修订条目。
    editor.chain().focus().setColor(color).run()
    setColorMenuOpen(false)
  }

  function clearTextColor() {
    // 仅清除文字颜色 mark，避免“清除标色”误删加粗、批注、修订等其它语义 mark。
    editor.chain().focus().unsetColor().run()
    setColorMenuOpen(false)
  }

  return (
    <>
      <BubbleMenu
        editor={editor}
        options={{ placement: "top" }}
        shouldShow={({ editor: currentEditor, state }) => currentEditor.isEditable && !state.selection.empty}
      >
        <div className="relative flex max-w-[92vw] items-center gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-lg">
          <ToolbarButton
            title="批注"
            onClick={() => {
              const { from, to } = editor.state.selection
              setPendingComment({ from, to })
            }}
          >
            <MessageSquarePlus className="size-4 text-amber-600" />
          </ToolbarButton>
          <ToolbarButton title="编辑建议" onClick={() => insertEditSuggestionAfterSelection(editor, createdBy)}>
            <Quote className="size-4 text-amber-600" />
          </ToolbarButton>
          {revisionTracking && (
            <ToolbarButton title="标记删除" onClick={() => editor.chain().focus().markSelectionAsDeletedRevision().run()}>
              <Trash2 className="size-4 text-red-600" />
            </ToolbarButton>
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton title="正文" active={editor.isActive("paragraph")} onClick={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="一级标题" active={editor.isActive("heading", { level: 1 })} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="二级标题" active={editor.isActive("heading", { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="三级标题" active={editor.isActive("heading", { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="size-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton title="加粗" active={editor.isActive("bold")} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="斜体" active={editor.isActive("italic")} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="下划线" active={editor.isActive("underline")} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="删除线" active={editor.isActive("strike")} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="size-4" />
          </ToolbarButton>
          <div className="flex items-center overflow-hidden rounded-md border border-transparent">
            <ToolbarButton title="标色（默认蓝色）" active={selectedTextColor === DEFAULT_TEXT_COLOR} onClick={() => applyTextColor(DEFAULT_TEXT_COLOR)}>
              <Palette className="size-4" style={{ color: selectedTextColor ?? DEFAULT_TEXT_COLOR }} />
            </ToolbarButton>
            <button
              className={cn(
                "inline-flex h-8 w-5 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                colorMenuOpen && "bg-primary/10 text-primary",
              )}
              type="button"
              title="选择标色"
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => setColorMenuOpen((open) => !open)}
            >
              <ChevronDown className="size-3.5" />
            </button>
          </div>
          {colorMenuOpen && (
            <div
              className="absolute right-1 top-[calc(100%+0.35rem)] z-50 grid w-36 gap-1 rounded-lg border border-border bg-popover p-1 text-popover-foreground shadow-xl"
              onMouseDown={(event) => event.preventDefault()}
            >
              {TEXT_COLOR_OPTIONS.map((option) => {
                const active = selectedTextColor === option.value

                return (
                  <button
                    key={option.value}
                    className={cn(
                      "flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      active && "bg-primary/10 text-primary",
                    )}
                    type="button"
                    onClick={() => applyTextColor(option.value)}
                  >
                    <span className="size-3.5 rounded-full border border-foreground/15" style={{ backgroundColor: option.value }} />
                    <span>{option.label}</span>
                  </button>
                )
              })}
              <button
                className="flex items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                type="button"
                onClick={clearTextColor}
              >
                <span className="size-3.5 rounded-full border border-dashed border-muted-foreground/60 bg-background" />
                <span>清除标色</span>
              </button>
            </div>
          )}
          <ToolbarButton title="清除格式" onClick={() => editor.chain().focus().unsetAllMarks().clearNodes().run()}>
            <Eraser className="size-4" />
          </ToolbarButton>
        </div>
      </BubbleMenu>

      {pendingComment && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 px-4"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closeCommentDialog()
            }
          }}
        >
          <div className="w-full max-w-md rounded-lg border border-border bg-popover p-4 text-popover-foreground shadow-xl">
            <h2 className="text-base font-semibold">添加批注</h2>
            <textarea
              ref={textareaRef}
              className="mt-3 min-h-28 w-full resize-y rounded-md border border-input bg-background px-3 py-2 text-sm leading-6 outline-none focus-visible:ring-2 focus-visible:ring-ring"
              value={commentDraft}
              placeholder="输入批注内容"
              onChange={(event) => setCommentDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Escape") {
                  closeCommentDialog()
                }

                if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                  saveComment()
                }
              }}
            />
            <div className="mt-4 flex justify-end gap-2">
              <Button type="button" variant="ghost" onClick={closeCommentDialog}>
                取消
              </Button>
              <Button type="button" disabled={!commentDraft.trim()} onClick={saveComment}>
                确认
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  )
}

export function NovelTiptapEditor({
  value,
  editable,
  trackChanges,
  createdBy,
  saveState,
  className,
  readonlyLabel,
  onChange,
  onReady,
}: NovelTiptapEditorProps) {
  const extensions = useMemo(() => createNovelEditorExtensions({ trackChanges, createdBy }), [createdBy, trackChanges])
  const initialValue = useRef(value)
  const lastExternalValue = useRef(stringifyContent(value))
  const localEchoSignatures = useRef<string[]>([])
  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: initialValue.current,
    editorProps: {
      attributes: {
        class: "novel-prosemirror focus:outline-none",
      },
    },
    onUpdate({ editor: currentEditor }) {
      const json = currentEditor.getJSON() as NovelDocJson
      const signature = stringifyContent(json)

      // React 父组件会把本次 onUpdate 的 JSON 重新作为 value 传回来；这些“本地回声”
      // 不是外部换稿，不能再触发整篇 setContent，否则会打断 ProseMirror 正在维护的选区。
      // 这里保留最近一小段签名，是为了覆盖中文输入法 composition finalize 与 React effect
      // 交错执行时出现的旧回声：即使旧 value 晚于新事务到达，也只确认它，不回写正文。
      if (!localEchoSignatures.current.includes(signature)) {
        localEchoSignatures.current.push(signature)
      }

      if (localEchoSignatures.current.length > 24) {
        localEchoSignatures.current = localEchoSignatures.current.slice(-24)
      }

      onChange(json, deriveNovelDocProjection(json))
    },
  })

  useEffect(() => {
    onReady?.(editor ?? null)

    return () => onReady?.(null)
  }, [editor, onReady])

  useEffect(() => {
    editor?.setEditable(editable)
  }, [editable, editor])

  useEffect(() => {
    if (!editor) {
      return
    }

    const next = stringifyContent(value)

    const localEchoIndex = localEchoSignatures.current.indexOf(next)

    if (localEchoIndex >= 0) {
      // 这是当前编辑器自己刚发给父组件的内容快照。即使 editor 此刻已经进入后续事务，
      // 也不能用这个可能稍旧的 value 覆盖整篇文档；只把它标记为已见过即可。
      localEchoSignatures.current.splice(localEchoIndex, 1)
      lastExternalValue.current = next
      return
    }

    if (next === lastExternalValue.current || next === stringifyContent(editor.getJSON() as NovelDocJson)) {
      lastExternalValue.current = next
      return
    }

    // 只有真正来自外部的数据变化才整篇替换，例如首次加载后的服务端刷新、流程动作后换稿、
    // 或只读历史版本切换。普通输入路径已经在上面的本地回声分支被拦住。
    lastExternalValue.current = next
    editor.commands.setContent(value, { emitUpdate: false })
  }, [editor, value])

  const characters = editor?.storage.characterCount?.characters?.() ?? deriveNovelDocProjection(value).wordCount

  return (
    <div
      className={cn(
        "relative flex min-h-0 min-w-0 flex-col",
        // 没有页面层高度约束的只读版本页，保留基础阅读高度；当前编辑页会传入 flex 高度覆盖。
        !className && "min-h-[620px]",
        className,
      )}
    >
      <div className="absolute right-4 top-4 z-10 flex flex-wrap justify-end gap-2">
        <span className={cn("inline-flex h-7 items-center gap-1 rounded-md border px-2 text-xs font-medium", statusTone(saveState))}>
          <Save className="size-3.5" />
          {statusLabel(saveState, readonlyLabel)}
        </span>
        <span className="inline-flex h-7 items-center rounded-md border border-border bg-background/90 px-2 text-xs text-muted-foreground">
          {characters.toLocaleString()} 字
        </span>
      </div>

      <div className={cn("min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm", !editable && "bg-muted/20")}>
        {/* 这个滚动层是批注/修订跳转的定位基准；右侧卡片只滚动这里，不再推动整个页面。 */}
        <EditorContent editor={editor} className="h-full overflow-y-auto" data-doc-editor-scroll="true" />
      </div>

      {editor && editable && <SelectionBubble editor={editor} createdBy={createdBy} />}
    </div>
  )
}
