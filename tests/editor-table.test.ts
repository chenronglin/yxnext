// @vitest-environment jsdom
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { CellSelection } from "@tiptap/pm/tables"
import { afterEach, describe, expect, it, vi } from "vitest"
import { createNovelEditorExtensions, applyInsertedText, createRevisionCompositionController } from "@/components/doc/tiptap/extensions"
import { normalizeTableClipboardHtml } from "@/components/doc/tiptap/table-extensions"
import { deriveNovelDocProjection, type NovelDocJson } from "@/lib/novel-doc"
import { TABLE_LIMITS, validateNovelTables } from "@/lib/novel-table"
import { makeTable, makeTableDoc, OFFICE_TABLE_HTML } from "./support/table-fixtures"

const actor = { userId: "editor", role: "editor" as const, nameSnapshot: "编辑" }
// jsdom 不执行布局；补齐 PM/占位符读取的几何 API，粘贴、选区和事务仍执行真实插件代码。
Object.defineProperty(document, "elementFromPoint", { value: () => null, configurable: true })
Object.defineProperty(Range.prototype, "getClientRects", { value: () => [], configurable: true })
Object.defineProperty(Range.prototype, "getBoundingClientRect", { value: () => new DOMRect(), configurable: true })
vi.stubGlobal("ClipboardEvent", Event)
const editors: Editor[] = []
function editor(content: object = makeTableDoc(), trackChanges = false, editable = true) {
  const instance = new Editor({ element: document.createElement("div"), extensions: createNovelEditorExtensions({ trackChanges, createdBy: actor }), content, editable })
  editors.push(instance)
  return instance
}
function cells(instance: Editor) {
  const positions: number[] = []
  instance.state.doc.descendants((node, position) => {
    if (["tableCell", "tableHeader"].includes(node.type.name)) positions.push(position)
  })
  return positions
}
function pasteTsv(instance: Editor, text: string) {
  // pasteText API 代表强制纯文本；使用真实 paste 事件验证系统剪贴板只有 text/plain 的普通粘贴。
  const event = new Event("paste", { bubbles: true, cancelable: true })
  Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => type === "text/plain" ? text : "" } })
  instance.view.dom.dispatchEvent(event)
}
function table(instance: Editor) {
  return instance.getJSON().content?.find((node) => node.type === "table") as { content?: Array<{ content?: Array<{ type: string }> }> } | undefined
}
afterEach(() => { editors.splice(0).forEach((instance) => instance.destroy()); vi.useRealTimers() })

describe("基础表格交互与往返", () => {
  it.each([false, true])("菜单插入表格不删除原正文选区（修订模式：%s）", (trackChanges) => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "原有正文" }] }] }, trackChanges)
    instance.commands.setTextSelection({ from: 1, to: 5 })
    expect(instance.commands.insertTable({ rows: 2, cols: 2 })).toBe(true)
    expect(instance.getText()).toContain("原有正文")
    expect(table(instance)?.content).toHaveLength(2)
  })
  it("从引用段落粘贴表格会落到文档层，引用正文和表格均可独立导出", () => {
    const instance = editor({ type: "doc", content: [{ type: "blockquote", content: [{ type: "paragraph", content: [{ type: "text", text: "原有引用" }] }] }] })
    instance.commands.setTextSelection(2)
    instance.view.pasteHTML(OFFICE_TABLE_HTML.wps)
    expect(table(instance)?.content).toHaveLength(2)
    expect(instance.getText()).toContain("原有引用")
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })
  it("支持插入、增删行列、表头切换和删除表格", () => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph" }] })
    expect(instance.commands.insertTable({ rows: 2, cols: 2, withHeaderRow: false })).toBe(true)
    expect(instance.commands.addRowAfter()).toBe(true)
    expect(instance.commands.addColumnBefore()).toBe(true)
    expect(table(instance)?.content).toHaveLength(3)
    expect(table(instance)?.content?.[0].content).toHaveLength(3)
    expect(instance.commands.toggleHeaderRow()).toBe(true)
    expect(table(instance)?.content?.[0].content?.[0].type).toBe("tableHeader")
    expect(instance.commands.deleteRow()).toBe(true)
    expect(instance.commands.deleteColumn()).toBe(true)
    expect(table(instance)?.content).toHaveLength(2)
    expect(instance.commands.deleteTable()).toBe(true)
    expect(table(instance)).toBeUndefined()
  })

  it("增删结构可以撤销重做，JSON 重载和只读 HTML 保留空单元格与表头", () => {
    const instance = editor(makeTableDoc(makeTable([["名称", "值"], ["甲", ""]])))
    instance.commands.setTextSelection(cells(instance)[0] + 2)
    instance.commands.addRowAfter()
    expect(instance.commands.undo()).toBe(true)
    expect(table(instance)?.content).toHaveLength(2)
    expect(instance.commands.redo()).toBe(true)
    expect(table(instance)?.content).toHaveLength(3)
    const snapshot = instance.getJSON()
    const readOnly = editor(snapshot, false, false)
    expect(readOnly.getJSON()).toEqual(snapshot)
    expect(readOnly.isEditable).toBe(false)
    expect(readOnly.getHTML()).toContain("<table")
    expect(readOnly.getHTML()).toContain("<th")
    expect(readOnly.view.dom.querySelectorAll("td,th")).toHaveLength(6)
  })

  it("禁止合并、嵌套和越界命令，错误事务不污染可保存 JSON", () => {
    const instance = editor()
    instance.commands.setTextSelection(cells(instance)[0] + 2)
    expect(instance.commands.insertTable()).toBe(false)
    expect(instance.commands.mergeCells()).toBe(false)
    const before = instance.getJSON()
    instance.view.dispatch(instance.state.tr.setNodeMarkup(cells(instance)[0], undefined, { colspan: 2, rowspan: 1 }))
    expect(instance.getJSON()).toEqual(before)
    expect(validateNovelTables(before)).toBeNull()
    const empty = editor({ type: "doc", content: [{ type: "paragraph" }] })
    expect(empty.commands.insertTable({ rows: 101, cols: 1 })).toBe(false)
  })

  it("最后一个单元格 Tab 增行，达到上限时不会写出超限表格", () => {
    const instance = editor(makeTableDoc(makeTable([["甲", "乙"]])))
    instance.commands.setTextSelection(cells(instance)[1] + 2)
    instance.view.someProp("handleKeyDown", (handler) => handler(instance.view, new KeyboardEvent("keydown", { key: "Tab" })))
    expect(table(instance)?.content).toHaveLength(2)
    const full = editor(makeTableDoc(makeTable(Array.from({ length: 100 }, () => ["甲"]))))
    full.commands.setTextSelection(cells(full)[99] + 2)
    full.commands.addRowAfter()
    expect(table(full)?.content).toHaveLength(100)
  })
})

describe("Office/WPS 剪贴板与表格选区", () => {
  it.each(Object.entries(OFFICE_TABLE_HTML))("%s HTML 仅保留显示值，维持二维结构与表前后正文", (_name, html) => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph" }] }, true)
    instance.view.pasteHTML(html)
    expect(table(instance)?.content).toHaveLength(2)
    expect(table(instance)?.content?.[0].content).toHaveLength(2)
    const json = JSON.stringify(table(instance))
    expect(json).toContain('"text":"3"')
    expect(json).not.toContain("SUM")
    expect(json).not.toContain("formula")
    if (_name === "word") {
      expect(instance.getText()).toContain("表前正文")
      expect(instance.getText()).toContain("表后正文")
    }
  })

  it("纯文本 TSV 解析空值、双引号和单元格内换行", () => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph" }] })
    pasteTsv(instance, '姓名\t备注\n甲\t"第一行\n第二行"\n乙\t\n')
    expect(table(instance)?.content).toHaveLength(3)
    expect(deriveNovelDocProjection(instance.getJSON() as NovelDocJson).plainText).toBe("姓名\t备注\n甲\t第一行\n第二行\n乙\t")
  })

  it("矩形粘贴覆盖对应单元格，修订模式下不会插入嵌套表格或移走相邻单元格", () => {
    const instance = editor(makeTableDoc(makeTable([["旧1", "旧2", "保留"], ["旧3", "旧4", "保留2"]])), true)
    const positions = cells(instance)
    instance.view.dispatch(instance.state.tr.setSelection(CellSelection.create(instance.state.doc, positions[0], positions[4])))
    pasteTsv(instance, "新1\t新2\n新3\t新4")
    expect(table(instance)?.content).toHaveLength(2)
    expect(table(instance)?.content?.[0].content).toHaveLength(3)
    expect(instance.getText()).toContain("保留2")
    expect(instance.getText()).not.toContain("旧")
    expect(deriveNovelDocProjection(instance.getJSON() as NovelDocJson).cleanText).toBe("新1\t新2\t保留\n新3\t新4\t保留2")
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })

  it("单元格光标粘贴二维表格会按行列覆盖和扩展", () => {
    const instance = editor(makeTableDoc(makeTable([["原"]])), true)
    instance.commands.setTextSelection(cells(instance)[0] + 2)
    instance.view.pasteHTML(OFFICE_TABLE_HTML.wps)
    expect(table(instance)?.content).toHaveLength(2)
    expect(table(instance)?.content?.[0].content).toHaveLength(2)
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })

  it.each([
    '<table><tr><td colspan="2">合并值</td></tr></table>',
    '<table><tr><td>外层<table><tr><td>内层</td></tr></table></td></tr></table>',
    '<table><tr><td>甲</td><td>乙</td></tr><tr><td>丙</td></tr></table>',
  ])("不支持的表格降级为有提示的文本：%s", (html) => {
    const report = vi.fn()
    const result = normalizeTableClipboardHtml(html, report)
    expect(result).not.toContain("<table")
    expect(report).toHaveBeenCalledTimes(1)
    const instance = editor({ type: "doc", content: [{ type: "paragraph" }] })
    instance.view.pasteHTML(html)
    expect(table(instance)).toBeUndefined()
    expect(instance.getText().length).toBeGreaterThan(0)
  })

  it("超大剪贴板取消操作，绝不删除原选区", () => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "保留原文" }] }] })
    instance.commands.setTextSelection({ from: 1, to: 5 })
    const before = instance.getJSON()
    const event = new Event("paste", { bubbles: true, cancelable: true })
    Object.defineProperty(event, "clipboardData", { value: { getData: (type: string) => type === "text/plain" ? `甲\t${"乙".repeat(TABLE_LIMITS.clipboardCharacters)}` : "" } })
    instance.view.dom.dispatchEvent(event)
    expect(event.defaultPrevented).toBe(true)
    expect(instance.getJSON()).toEqual(before)
  })

  it("程序化超大 HTML 粘贴也保护原选区，下一次正常粘贴不被误拦截", () => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "原文" }] }] })
    instance.commands.setTextSelection({ from: 1, to: 3 })
    const before = instance.getJSON()
    instance.view.pasteHTML(`<table><tr><td>${"甲".repeat(TABLE_LIMITS.clipboardCharacters)}</td></tr></table>`)
    expect(instance.getJSON()).toEqual(before)
    instance.view.pasteHTML(OFFICE_TABLE_HTML.wps)
    expect(table(instance)?.content).toHaveLength(2)
  })

  it("强制纯文本粘贴不转表格，单元格普通粘贴仍保留文字修订", () => {
    const plain = editor({ type: "doc", content: [{ type: "paragraph" }] })
    plain.view.pasteText("甲\t乙\n丙\t丁")
    expect(table(plain)).toBeUndefined()
    const instance = editor(undefined, true)
    instance.commands.setTextSelection(cells(instance)[2] + 2)
    instance.view.pasteHTML("<p>新增</p>")
    expect(JSON.stringify(table(instance))).toContain('"role":"inserted"')
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })

  it("内部表格复制保持粗体，普通正文粘贴保持既有修订", () => {
    const source = editor()
    source.commands.setTextSelection({ from: cells(source)[0] + 2, to: cells(source)[0] + 4 })
    source.commands.setBold()
    const target = editor({ type: "doc", content: [{ type: "paragraph" }] }, true)
    target.view.pasteHTML(source.getHTML())
    expect(JSON.stringify(table(target))).toContain('"type":"bold"')
    const plain = editor({ type: "doc", content: [{ type: "paragraph" }] }, true)
    plain.view.pasteHTML("<p>普通正文</p>")
    expect(JSON.stringify(plain.getJSON())).toContain('"role":"inserted"')
  })
})

describe("表格与文字修订兼容", () => {
  it.each([OFFICE_TABLE_HTML.wps, "<table><tr><td></td></tr></table>"])("表格替换正文选区时保留原文和批注锚点：%s", (html) => {
    const instance = editor({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "需要保留的原文", marks: [{ type: "comment", attrs: { id: "original-comment", body: "原批注" } }] }] }] }, true)
    instance.commands.setTextSelection({ from: 1, to: 8 })
    instance.view.pasteHTML(html)
    expect(table(instance)).toBeDefined()
    expect(instance.getText()).toContain("需要保留的原文")
    expect(JSON.stringify(instance.getJSON())).toContain("original-comment")
    expect(deriveNovelDocProjection(instance.getJSON() as NovelDocJson).cleanText).not.toContain("需要保留的原文")
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })
  it("单个单元格直接输入修订不影响相邻单元格", () => {
    const instance = editor(undefined, true)
    const from = cells(instance)[2] + 2
    applyInsertedText(instance.view, "新增", { from, to: from }, { enabled: true, createdBy: actor })
    expect(deriveNovelDocProjection(instance.getJSON() as NovelDocJson).cleanText).toBe("姓名\t数量\n新增甲\t3")
    expect(validateNovelTables(instance.getJSON())).toBeNull()
  })

  it("中文输入法收口保留修订与行列结构", () => {
    vi.useFakeTimers()
    const instance = editor(undefined, true)
    const from = cells(instance)[2] + 2
    instance.commands.setTextSelection(from)
    const controller = createRevisionCompositionController(() => ({ enabled: true, createdBy: actor }))
    controller.handleCompositionStart(instance.view)
    const transaction = instance.state.tr.insertText("中文", from).setMeta("composition", 1)
    transaction.setSelection(TextSelection.create(transaction.doc, from + 2))
    controller.observeTransaction(transaction)
    instance.view.dispatch(transaction)
    controller.handleCompositionEnd(instance.view)
    vi.runAllTimers()
    expect(instance.getText()).toContain("中文甲")
    expect(JSON.stringify(table(instance))).toContain('"role":"inserted"')
    expect(validateNovelTables(instance.getJSON())).toBeNull()
    controller.destroy()
  })
})
