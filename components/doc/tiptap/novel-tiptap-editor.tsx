"use client"

import { EditorContent, useEditor, useEditorState } from "@tiptap/react"
import { BubbleMenu } from "@tiptap/react/menus"
import type { Editor } from "@tiptap/core"
import { Bold, ChevronDown, Eraser, Heading1, Heading2, Heading3, Italic, MessageSquarePlus, Palette, Pilcrow, Quote, Save, Strikethrough, Trash2, UnderlineIcon } from "lucide-react"
import { useEffect, useMemo, useRef, useState } from "react"

import {
  addCommentToRange,
  createNovelEditorExtensions,
  insertEditSuggestionAfterSelection,
  isRevisionCompositionBusy,
  isRevisionTrackingEnabled,
} from "@/components/doc/tiptap/extensions"
import { Button } from "@/components/ui/button"
import {
  deriveNovelDocProjection,
  ensureNovelBlockIds,
  type NovelCreatedBy,
  type NovelDocJson,
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
  onChange: (json: NovelDocJson) => void
  onReady?: (editor: Editor | null) => void
}

type PendingComment = {
  from: number
  to: number
}

type PendingExternalContent = {
  value: NovelDocJson
  signature: string
}

const DEFAULT_TEXT_COLOR = "#2563eb"

const TEXT_COLOR_OPTIONS = [
  { label: "蓝色", value: DEFAULT_TEXT_COLOR },
  { label: "红色", value: "#dc2626" },
  { label: "绿色", value: "#16a34a" },
  { label: "橙色", value: "#ea580c" },
  { label: "紫色", value: "#9333ea" },
] as const

// 这些 EditorView 属性在编辑器整个生命周期内都不会变化，因此必须保持同一个对象引用。
// 如果把对象字面量写在组件 render 中，Tiptap 会把每次 React render 都识别为 options 变化，
// 随后调用 view.setProps/updateState；这种无意义的 View 更新尤其容易干扰浏览器正在进行的 IME 会话。
const NOVEL_EDITOR_PROPS = {
  attributes: {
    class: "novel-prosemirror focus:outline-none",
  },
}

// BubbleMenu 会监听 options 引用并用一个 ProseMirror meta transaction 热更新配置。
// placement 是固定值，提升到模块级可以避免正文输入导致菜单每次都额外 dispatch transaction。
const SELECTION_BUBBLE_OPTIONS = { placement: "top" } as const

// compositionend 与 ProseMirror 最终 transaction 的先后顺序由浏览器决定。
// 使用很短的轮询间隔只等待输入法状态收口，不阻塞主线程，也不会把 preedit 临时文本发布给父层。
const COMPOSITION_SETTLE_RETRY_MS = 24

function stringifyContent(value: NovelDocJson) {
  // JSON 签名只在明确的外部换稿边界计算，不再用于每个输入 transaction 的本地回声判断。
  return JSON.stringify(value)
}

function shouldShowSelectionBubble({ editor, state }: { editor: Editor; state: Editor["state"] }) {
  // 该判断函数必须保持稳定引用；菜单是否显示仍完全由实时 EditorState 决定。
  return editor.isEditable && !state.selection.empty
}

function selectSelectionBubbleState({ editor }: { editor: Editor }) {
  const activeTextColor = editor.getAttributes("textStyle").color

  // 父组件不再逐字镜像正文 JSON 后，工具栏不能继续依赖父组件重渲染来刷新活跃态。
  // 这里仅订阅按钮真正关心的格式状态；useEditorState 会做深比较，普通文字输入不会重绘整套工具栏。
  return {
    revisionTracking: isRevisionTrackingEnabled(editor),
    selectedTextColor: typeof activeTextColor === "string" ? activeTextColor : null,
    paragraph: editor.isActive("paragraph"),
    heading1: editor.isActive("heading", { level: 1 }),
    heading2: editor.isActive("heading", { level: 2 }),
    heading3: editor.isActive("heading", { level: 3 }),
    bold: editor.isActive("bold"),
    italic: editor.isActive("italic"),
    underline: editor.isActive("underline"),
    strike: editor.isActive("strike"),
  }
}

function selectCharacterCount({ editor }: { editor: Editor | null }) {
  // CharacterCount storage 会随 transaction 同步更新；返回 null 时由调用方使用外部文档的初始字数兜底。
  return editor?.storage.characterCount?.characters?.() ?? null
}

function CharacterCountBadge({ editor, fallback }: { editor: Editor | null; fallback: number }) {
  const liveCharacters = useEditorState({
    editor,
    selector: selectCharacterCount,
  })
  const characters = liveCharacters ?? fallback

  // 把高频字数订阅隔离在这个很小的组件内，正文输入时无需重渲染整个 NovelTiptapEditor。
  return (
    <span className="inline-flex h-7 items-center rounded-md border border-border bg-background/90 px-2 text-xs text-muted-foreground">
      {characters.toLocaleString()} 字
    </span>
  )
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
  const toolbarState = useEditorState({
    editor,
    selector: selectSelectionBubbleState,
  })

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
        options={SELECTION_BUBBLE_OPTIONS}
        shouldShow={shouldShowSelectionBubble}
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
          {toolbarState.revisionTracking && (
            <ToolbarButton title="标记删除" onClick={() => editor.chain().focus().markSelectionAsDeletedRevision().run()}>
              <Trash2 className="size-4 text-red-600" />
            </ToolbarButton>
          )}
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton title="正文" active={toolbarState.paragraph} onClick={() => editor.chain().focus().setParagraph().run()}>
            <Pilcrow className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="一级标题" active={toolbarState.heading1} onClick={() => editor.chain().focus().toggleHeading({ level: 1 }).run()}>
            <Heading1 className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="二级标题" active={toolbarState.heading2} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="三级标题" active={toolbarState.heading3} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="size-4" />
          </ToolbarButton>
          <span className="mx-1 h-5 w-px bg-border" />
          <ToolbarButton title="加粗" active={toolbarState.bold} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="斜体" active={toolbarState.italic} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="下划线" active={toolbarState.underline} onClick={() => editor.chain().focus().toggleUnderline().run()}>
            <UnderlineIcon className="size-4" />
          </ToolbarButton>
          <ToolbarButton title="删除线" active={toolbarState.strike} onClick={() => editor.chain().focus().toggleStrike().run()}>
            <Strikethrough className="size-4" />
          </ToolbarButton>
          <div className="flex items-center overflow-hidden rounded-md border border-transparent">
            <ToolbarButton title="标色（默认蓝色）" active={toolbarState.selectedTextColor === DEFAULT_TEXT_COLOR} onClick={() => applyTextColor(DEFAULT_TEXT_COLOR)}>
              <Palette className="size-4" style={{ color: toolbarState.selectedTextColor ?? DEFAULT_TEXT_COLOR }} />
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
                const active = toolbarState.selectedTextColor === option.value

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
  const initialValue = useRef<NovelDocJson | null>(null)

  if (!initialValue.current) {
    // 初始化前先落实 block id 不变量，避免历史坏数据在第一次键入时触发大批 setNodeMarkup 事务。
    initialValue.current = ensureNovelBlockIds(value)
  }
  const lastExternalValueSignature = useRef(stringifyContent(value))
  const lastPublishedSignature = useRef(stringifyContent(value))
  const pendingExternalContent = useRef<PendingExternalContent | null>(null)
  const externalSyncTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const localPublishTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const onChangeRef = useRef(onChange)

  // Tiptap 会把最新 options 中的 onUpdate 回调转发进同一个 Editor 实例，但短定时器可能跨过一次 React render。
  // 用 ref 保存最新父回调，确保 composition 收口后发布的是最新处理函数，同时不把回调身份加入编辑器重建条件。
  onChangeRef.current = onChange

  function clearLocalPublishTimer() {
    if (!localPublishTimer.current) {
      return
    }

    clearTimeout(localPublishTimer.current)
    localPublishTimer.current = null
  }

  function publishCurrentDocumentWhenCompositionSettles(currentEditor: Editor) {
    if (currentEditor.isDestroyed) {
      clearLocalPublishTimer()
      return
    }

    if (pendingExternalContent.current) {
      // 权威外部换稿已经排队时，当前本地草稿即将被替换；不能再把旧会话内容送入自动保存队列。
      clearLocalPublishTimer()
      return
    }

    if (isRevisionCompositionBusy(currentEditor)) {
      // 原生 IME transaction 可能已经把 preedit 文本同步进 ProseMirror，但 revision finalize 尚未完成。
      // 此时只保留一个短重试，绝不把没有修订 mark 的临时 JSON 发布给父组件。
      if (!localPublishTimer.current) {
        localPublishTimer.current = setTimeout(() => {
          localPublishTimer.current = null
          publishCurrentDocumentWhenCompositionSettles(currentEditor)
        }, COMPOSITION_SETTLE_RETRY_MS)
      }

      return
    }

    clearLocalPublishTimer()
    const json = currentEditor.getJSON() as NovelDocJson
    const signature = stringifyContent(json)

    if (signature === lastPublishedSignature.current) {
      // composition 取消、最终内容与会话开始一致、或 timer 与最终 update 同时收口时都不应重复标脏和排队保存。
      return
    }

    lastPublishedSignature.current = signature
    onChangeRef.current(json)
  }

  const editor = useEditor({
    immediatelyRender: false,
    editable,
    extensions,
    content: initialValue.current,
    editorProps: NOVEL_EDITOR_PROPS,
    onUpdate({ editor: currentEditor }) {
      // 所有 update 都经过同一个 composition 门禁：普通输入立即发布，IME 临时态则缓冲到 busy 清除后再发布。
      // 这样 latestPayloadRef 永远只接收可以保存的最终文档，不会短暂落入“文字已插入但尚无修订 mark”的状态。
      publishCurrentDocumentWhenCompositionSettles(currentEditor)
    },
  })

  useEffect(() => {
    onReady?.(editor ?? null)

    return () => onReady?.(null)
  }, [editor, onReady])

  useEffect(() => {
    if (!editor || editor.isEditable === editable) {
      return
    }

    // setEditable 的第二个参数默认会主动 emit update；权限切换不属于正文修改，必须禁止伪更新，
    // 否则首次挂载或转只读时会被父层误判为 dirty，并安排一次没有实际内容变化的自动保存。
    editor.setEditable(editable, false)
  }, [editable, editor])

  useEffect(() => {
    if (!editor || editor.isDestroyed) {
      return
    }

    // 保存已经通过空值检查的稳定实例，避免短定时器闭包再次读取可能为 null 的 React hook 返回值。
    const currentEditor = editor
    const nextSignature = stringifyContent(value)
    const currentSignature = stringifyContent(currentEditor.getJSON() as NovelDocJson)
    const externalValueChanged = nextSignature !== lastExternalValueSignature.current

    if (!externalValueChanged) {
      // 外部 value 没有发生版本变化时，Editor 与该快照不一致恰恰说明用户正在本地编辑。
      // 这里必须无条件返回；若再比较后回写旧 value，就会在 saveState 等父级重渲染时把新输入整篇覆盖。
      return
    }

    if (currentSignature === nextSignature) {
      // 外部正文版本确实变化，但 Editor 已经处于同一内容时只更新基线，避免无意义替换 selection。
      lastExternalValueSignature.current = nextSignature
      return
    }

    const pending: PendingExternalContent = {
      value,
      signature: nextSignature,
    }
    let cancelled = false

    pendingExternalContent.current = pending

    function applyExternalContentWhenSafe() {
      if (cancelled || currentEditor.isDestroyed || pendingExternalContent.current !== pending) {
        return
      }

      if (isRevisionCompositionBusy(currentEditor)) {
        // 外部 value 代表真正的换稿，不能像旧逻辑一样在 composing 时直接 return 后永久丢失。
        // 持续使用单个短定时器重试，直到浏览器和 revision finalize 都结束，再一次性替换正文。
        externalSyncTimer.current = setTimeout(() => {
          externalSyncTimer.current = null
          applyExternalContentWhenSafe()
        }, COMPOSITION_SETTLE_RETRY_MS)
        return
      }

      externalSyncTimer.current = null
      pendingExternalContent.current = null
      lastExternalValueSignature.current = pending.signature
      lastPublishedSignature.current = pending.signature
      clearLocalPublishTimer()

      const latestCurrentSignature = stringifyContent(currentEditor.getJSON() as NovelDocJson)

      if (latestCurrentSignature !== pending.signature) {
        // emitUpdate=false 防止权威外部数据被重新当成本地编辑发布；真正的外部换稿由调用方自行维护保存状态。
        currentEditor.commands.setContent(pending.value, { emitUpdate: false })
      }
    }

    applyExternalContentWhenSafe()

    return () => {
      cancelled = true

      if (externalSyncTimer.current) {
        clearTimeout(externalSyncTimer.current)
        externalSyncTimer.current = null
      }

      if (pendingExternalContent.current === pending) {
        pendingExternalContent.current = null
      }
    }
  }, [editor, value])

  useEffect(() => {
    return () => {
      // 组件卸载或 Tiptap 实例被替换时清理 composition 发布重试，避免旧 Editor 的定时器
      // 占住共享 ref，导致新实例无法为自己的最终 IME 文档安排发布。
      clearLocalPublishTimer()
    }
  }, [editor])

  const fallbackCharacters = useMemo(() => deriveNovelDocProjection(value).wordCount, [value])

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
        <CharacterCountBadge editor={editor} fallback={fallbackCharacters} />
      </div>

      <div className={cn("min-h-0 flex-1 overflow-hidden rounded-xl border border-border bg-card shadow-sm", !editable && "bg-muted/20")}>
        {/* 这个滚动层是批注/修订跳转的定位基准；右侧卡片只滚动这里，不再推动整个页面。 */}
        <EditorContent editor={editor} className="h-full overflow-y-auto" data-doc-editor-scroll="true" />
      </div>

      {editor && editable && <SelectionBubble editor={editor} createdBy={createdBy} />}
    </div>
  )
}
