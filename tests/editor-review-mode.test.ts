// @vitest-environment jsdom
import { Editor } from "@tiptap/core"
import { Slice, Fragment } from "@tiptap/pm/model"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { NovelTiptapEditor } from "@/components/doc/tiptap/novel-tiptap-editor"
import { addCommentToRange, createNovelEditorExtensions, isRevisionTrackingEnabled } from "@/components/doc/tiptap/extensions"
import { createNovelDocV1, createNovelParagraph, deriveNovelDocProjection, type NovelDocJson } from "@/lib/novel-doc"

const actor = { userId: "reviewer", role: "editor" as const, nameSnapshot: "审核编辑" }
let root: Root
let host: HTMLDivElement
let currentEditor: Editor | null
let value: NovelDocJson
const onChange = vi.fn<(json: NovelDocJson) => void>()
const onReady = (editor: Editor | null) => { currentEditor = editor }

function editor() {
  if (!currentEditor) throw new Error("编辑器尚未就绪")
  return currentEditor
}

async function render(editable: boolean, trackChanges: boolean) {
  await act(async () => {
    root.render(createElement(NovelTiptapEditor, { value, editable, trackChanges, createdBy: actor, saveState: editable ? "saved" : "readonly", onChange, onReady }))
  })
}

// 走真实插件的浏览器输入入口，不能直接调用强制 enabled=true 的修订工具函数，否则会掩盖本次故障。
function typeText(text: string, from: number, to = from) {
  const view = editor().view
  view.someProp("handleTextInput", (handler) => handler(view, from, to, text, () => view.state.tr.insertText(text, from, to)))
}

function revisionText(role: string) {
  let text = ""
  editor().state.doc.descendants((node) => {
    if (node.isText && node.marks.some((mark) => mark.type.name === "revision" && mark.attrs.role === role)) text += node.text
  })
  return text
}

beforeEach(() => {
  // jsdom 没有真实布局；只补齐菜单/选区测量，编辑器和修订插件保持真实实现。
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  Object.defineProperty(Range.prototype, "getClientRects", { value: () => [], configurable: true })
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect(), configurable: true })
  Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  currentEditor = null
  value = createNovelDocV1({ docId: "1", docType: "chapter", title: "审核测试", content: [createNovelParagraph({ text: "作者原文" })] })
})

afterEach(async () => {
  await act(async () => root.unmount())
  host.remove()
  vi.unstubAllGlobals()
})

describe("开始审核时切换真实编辑器的修订模式", () => {
  it("预览转审核后立即标记新增，保存状态重渲染不丢失修订或正文", async () => {
    await render(false, false)
    const initial = editor()
    await render(true, true)
    expect(editor()).toBe(initial)
    expect(editor().isEditable).toBe(true)
    expect(isRevisionTrackingEnabled(editor())).toBe(true)
    expect(onChange).not.toHaveBeenCalled()
    await act(async () => typeText("新增", 5))
    expect(revisionText("inserted")).toBe("新增")
    expect(onChange).toHaveBeenCalled()
    await render(true, true)
    expect(editor().state.doc.textContent).toBe("作者原文新增")
    expect(revisionText("inserted")).toBe("新增")
    const saved = onChange.mock.lastCall![0]
    const restored = new Editor({ extensions: createNovelEditorExtensions({ trackChanges: true, createdBy: actor }), content: saved })
    expect(deriveNovelDocProjection(restored.getJSON() as NovelDocJson).revisionMarkCount).toBeGreaterThan(0)
    restored.destroy()
  })

  it("开始后删除仍保留原文并标删；添加批注不抹除修订", async () => {
    await render(false, false)
    await render(true, true)
    await act(async () => {
      editor().commands.setTextSelection({ from: 1, to: 3 })
      const view = editor().view
      view.someProp("handleKeyDown", (handler) => handler(view, new KeyboardEvent("keydown", { key: "Backspace" })))
    })
    expect(editor().state.doc.textContent).toBe("作者原文")
    expect(revisionText("deleted")).toBe("作者")
    await act(async () => { addCommentToRange(editor(), { from: 3, to: 5, body: "请补充说明", createdBy: actor }) })
    const projection = deriveNovelDocProjection(editor().getJSON() as NovelDocJson)
    expect(projection.commentCount).toBe(1)
    expect(projection.revisionMarkCount).toBeGreaterThan(0)
  })

  it("开始后替换原文保留 original，新文字标记 inserted", async () => {
    await render(false, false)
    await render(true, true)
    await act(async () => typeText("改文", 1, 5))
    expect(revisionText("original")).toBe("作者原文")
    expect(revisionText("inserted")).toBe("改文")
  })

  it("开始后粘贴也生成修订", async () => {
    await render(false, false)
    await render(true, true)
    await act(async () => {
      editor().commands.setTextSelection(5)
      const view = editor().view
      const slice = new Slice(Fragment.from(view.state.schema.text("粘贴")), 0, 0)
      const handled = view.someProp("handlePaste", (handler) => handler(view, new Event("paste") as ClipboardEvent, slice))
      expect(handled).toBe(true)
    })
    expect(revisionText("inserted")).toBe("粘贴")
  })

  it("开始后中文输入法结束时发布带修订的最终稿", async () => {
    await render(false, false)
    await render(true, true)
    await act(async () => {
      editor().commands.setTextSelection(5)
      const view = editor().view
      view.someProp("handleDOMEvents", (handlers) => { handlers.compositionstart?.(view, new CompositionEvent("compositionstart")); return false })
      view.dispatch(view.state.tr.insertText("中文", 5).setMeta("composition", 1))
      expect(onChange).not.toHaveBeenCalled()
      view.someProp("handleDOMEvents", (handlers) => { handlers.compositionend?.(view, new CompositionEvent("compositionend")); return false })
      await new Promise((resolve) => setTimeout(resolve, 80))
    })
    expect(revisionText("inserted")).toBe("中文")
    expect(deriveNovelDocProjection(onChange.mock.lastCall![0]).revisionMarkCount).toBeGreaterThan(0)
  })

  it("作者普通编辑保持不跟踪修订", async () => {
    await render(true, false)
    await act(async () => typeText("作者新增", 5))
    expect(editor().state.doc.textContent).toBe("作者原文作者新增")
    expect(deriveNovelDocProjection(editor().getJSON() as NovelDocJson).revisionMarkCount).toBe(0)
  })

  it("暂时只读再恢复审核保留修订和撤销历史", async () => {
    await render(false, false)
    await render(true, true)
    const initial = editor()
    await act(async () => typeText("新增", 5))
    const changes = onChange.mock.calls.length
    await render(false, false)
    await render(true, true)
    expect(editor()).toBe(initial)
    expect(onChange).toHaveBeenCalledTimes(changes)
    expect(revisionText("inserted")).toBe("新增")
    await act(async () => { editor().commands.undo() })
    expect(editor().state.doc.textContent).toBe("作者原文")
  })

  it("中文输入尚未收口时切换修订模式，先补齐该次修订再允许普通输入", async () => {
    await render(false, false)
    await render(true, true)
    await act(async () => {
      editor().commands.setTextSelection(5)
      const view = editor().view
      view.someProp("handleDOMEvents", (handlers) => { handlers.compositionstart?.(view, new CompositionEvent("compositionstart")); return false })
      view.dispatch(view.state.tr.insertText("中文", 5).setMeta("composition", 1))
    })
    await render(true, false)
    expect(editor().isEditable).toBe(false)
    expect(isRevisionTrackingEnabled(editor())).toBe(true)
    await act(async () => {
      const view = editor().view
      view.someProp("handleDOMEvents", (handlers) => { handlers.compositionend?.(view, new CompositionEvent("compositionend")); return false })
      await new Promise((resolve) => setTimeout(resolve, 100))
    })
    expect(isRevisionTrackingEnabled(editor())).toBe(false)
    expect(editor().isEditable).toBe(true)
    expect(revisionText("inserted")).toBe("中文")
    expect(deriveNovelDocProjection(onChange.mock.lastCall![0]).revisionMarkCount).toBeGreaterThan(0)
  })
})
