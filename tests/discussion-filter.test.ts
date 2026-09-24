// @vitest-environment jsdom
import { Editor } from "@tiptap/core"
import { act, createElement } from "react"
import { createRoot, type Root } from "react-dom/client"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"

import { DiscussionSidebar } from "@/components/doc/tiptap/discussion-sidebar"
import { createNovelEditorExtensions } from "@/components/doc/tiptap/extensions"

const actor = { userId: "reviewer", role: "editor" as const, nameSnapshot: "审核编辑" }
let editor: Editor
let root: Root
let host: HTMLDivElement

function filterButton(label: string) {
  const button = host.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)
  expect(button).not.toBeNull()
  return button!
}

async function click(element: HTMLElement) {
  await act(async () => element.click())
}

function cards() {
  return [...host.querySelectorAll("article")]
}

beforeEach(async () => {
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true)
  // 只补齐 jsdom 缺失的布局 API；列表与正文使用真实 React、Tiptap 和修订插件。
  Object.defineProperty(HTMLElement.prototype, "scrollIntoView", { value: () => {}, configurable: true })
  Object.defineProperty(Range.prototype, "getClientRects", { value: () => [], configurable: true })
  Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect(), configurable: true })
  Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true })
  editor = new Editor({
    extensions: createNovelEditorExtensions({ trackChanges: true, createdBy: actor }),
    content: {
      type: "doc",
      content: [{ type: "paragraph", content: [
        { type: "text", text: "批注原文", marks: [{ type: "comment", attrs: { id: "c1", body: "待核对", createdBy: actor } }] },
        { type: "text", text: "新增文字", marks: [{ type: "revision", attrs: { id: "r1", kind: "insert", role: "inserted", createdBy: actor } }] },
      ] }],
    },
  })
  host = document.createElement("div")
  document.body.append(host)
  root = createRoot(host)
  await act(async () => root.render(createElement(DiscussionSidebar, { editor })))
})

afterEach(async () => {
  await act(async () => root?.unmount())
  editor?.destroy()
  host?.remove()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe("批注修订侧栏筛选", () => {
  it("同页点选、互切、取消筛选，正文与选区不变化，也不触发保存", async () => {
    const before = editor.getJSON()
    const selection = editor.state.selection.toJSON()
    const onUpdate = vi.fn()
    editor.on("update", onUpdate)
    expect(cards()).toHaveLength(2)
    const comments = filterButton("筛选批注")
    const revisions = filterButton("筛选修订")
    expect(comments.getAttribute("aria-pressed")).toBe("false")
    await click(comments)
    expect(cards()).toHaveLength(1)
    expect(cards()[0].textContent).toContain("待核对")
    expect(comments.getAttribute("aria-pressed")).toBe("true")
    await click(revisions)
    expect(cards()).toHaveLength(1)
    expect(cards()[0].textContent).toContain("新增文字")
    expect(comments.getAttribute("aria-pressed")).toBe("false")
    expect(revisions.getAttribute("aria-pressed")).toBe("true")
    await click(revisions)
    expect(cards()).toHaveLength(2)
    expect(revisions.getAttribute("aria-pressed")).toBe("false")
    expect(editor.getJSON()).toEqual(before)
    expect(editor.state.selection.toJSON()).toEqual(selection)
    expect(onUpdate).not.toHaveBeenCalled()
  })

  it("筛选后立即定位正文；隐藏再显示批注时保留编辑草稿", async () => {
    await click(filterButton("筛选批注"))
    await click(cards()[0])
    expect(editor.state.selection.from).toBe(1)
    expect(editor.state.selection.to).toBe(5)
    await click(host.querySelector<HTMLButtonElement>('button[aria-label="修改批注"]')!)
    const input = host.querySelector<HTMLTextAreaElement>('textarea[aria-label="批注内容"]')!
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!.call(input, "未保存的中文批注")
      input.dispatchEvent(new Event("input", { bubbles: true }))
    })
    await click(filterButton("筛选修订"))
    expect(host.querySelector("textarea")).toBeNull()
    await click(filterButton("筛选批注"))
    expect(host.querySelector<HTMLTextAreaElement>("textarea")!.value).toBe("未保存的中文批注")
    expect(JSON.stringify(editor.getJSON())).toContain("待核对")
    const save = [...host.querySelectorAll("button")].find((button) => button.textContent === "保存")!
    await click(save)
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 200)) })
    expect(cards()[0].textContent).toContain("未保存的中文批注")
    // 用保存时的真实编辑器 JSON 重新打开，确认筛选没有进入文档数据或抹除另一类标记。
    const reopened = new Editor({ extensions: createNovelEditorExtensions({ trackChanges: true, createdBy: actor }), content: editor.getJSON() })
    try {
      expect(reopened.getJSON()).toEqual(editor.getJSON())
      expect(JSON.stringify(reopened.getJSON())).toContain("未保存的中文批注")
      expect(JSON.stringify(reopened.getJSON())).toContain('"revision"')
    } finally {
      reopened.destroy()
    }
  })

  it("筛选期间正文变化实时更新列表，撤销记录保留，空结果可取消", async () => {
    await click(filterButton("筛选修订"))
    await act(async () => {
      editor.commands.selectAll()
      editor.commands.unsetMark("revision")
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    expect(cards()).toHaveLength(0)
    expect(host.textContent).toContain("暂无修订。")
    await act(async () => {
      editor.commands.undo()
      await new Promise((resolve) => setTimeout(resolve, 200))
    })
    expect(cards()).toHaveLength(1)
    await click(filterButton("筛选修订"))
    expect(cards()).toHaveLength(2)
  })
})
