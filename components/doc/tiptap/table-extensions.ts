"use client"

import { Extension } from "@tiptap/core"
import { Table, TableCell, TableHeader, TableRow } from "@tiptap/extension-table"
import { DOMParser as ProseMirrorDOMParser, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { Plugin, Selection } from "@tiptap/pm/state"
import { isTableSizeAllowed, parseTableTsv, TABLE_LIMITS, validateNovelTables } from "@/lib/novel-table"

export const TABLE_NOTICE_EVENT = "novel-table-notice"

function notify(message: string) {
  // 通知只更新独立提示条，不派发编辑事务，避免影响输入法、选区和自动保存。
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent(TABLE_NOTICE_EVENT, { detail: message }))
}

function visibleText(element: Element): string {
  const copy = element.cloneNode(true) as Element
  copy.querySelectorAll("script,style,iframe,object,embed,img,input,button,select,textarea,[hidden],[style*='display:none'],[style*='display: none']").forEach((node) => node.remove())
  copy.querySelectorAll("br").forEach((node) => node.replaceWith("\n"))
  copy.querySelectorAll("p,div,tr").forEach((node) => node.append("\n"))
  return (copy.textContent ?? "").replace(/\u00a0/g, " ").replace(/\n$/, "")
}

function textParagraph(document: Document, text: string) {
  const paragraph = document.createElement("p")
  text.split("\n").forEach((line, index) => {
    if (index) paragraph.append(document.createElement("br"))
    paragraph.append(document.createTextNode(line))
  })
  return paragraph
}

// 仅替换 HTML 中的表格，前后正文仍由既有 Tiptap 粘贴流程解析；不读取公式、宏或 Office 私有元数据。
export function normalizeTableClipboardHtml(html: string, report: (message: string) => void = notify): string {
  if (!/<table[\s>]/i.test(html)) return html
  if (html.length > TABLE_LIMITS.clipboardCharacters) {
    report("表格剪贴板内容过大，请分批复制（每次不超过 100 万字符）。")
    return ""
  }
  const document = new DOMParser().parseFromString(html, "text/html")
  const tables = Array.from(document.querySelectorAll("table")).filter((table) => !table.parentElement?.closest("table"))
  for (const table of tables) {
    const rows = Array.from(table.rows)
    const width = rows[0]?.cells.length ?? 0
    const unsupported = table.querySelector("table") || !isTableSizeAllowed(rows.length, width) || rows.some((row) =>
      row.cells.length !== width || Array.from(row.cells).some((cell) => cell.colSpan !== 1 || cell.rowSpan !== 1),
    )
    if (unsupported) {
      const fallback = document.createDocumentFragment()
      for (const row of rows) fallback.append(textParagraph(document, Array.from(row.cells, visibleText).join("\t")))
      if (!rows.length) fallback.append(textParagraph(document, visibleText(table)))
      table.replaceWith(fallback)
      report("包含合并、嵌套、不规则或超限表格，已按文本粘贴；可撤销后分批复制基础矩形区域。")
      continue
    }
    const cleanTable = document.createElement("table")
    const internal = table.getAttribute("data-novel-table") === "true"
    for (const row of rows) {
      const cleanRow = document.createElement("tr")
      for (const cell of Array.from(row.cells)) {
        const cleanCell = document.createElement(cell.tagName === "TH" ? "th" : "td")
        // 编辑器内部复制保留段落格式与已有标记，最终仍由 schema 白名单解析；Office 只保留复制时显示值。
        if (internal) cleanCell.innerHTML = cell.innerHTML
        else cleanCell.append(textParagraph(document, visibleText(cell)))
        cleanRow.append(cleanCell)
      }
      cleanTable.append(cleanRow)
    }
    table.replaceWith(cleanTable)
  }
  return document.body.innerHTML
}

export function selectionTouchesTable(selection: { $from: { depth: number; node: (depth: number) => ProseMirrorNode }; $to: { depth: number; node: (depth: number) => ProseMirrorNode } }) {
  return [selection.$from, selection.$to].some(($pos) => {
    for (let depth = $pos.depth; depth > 0; depth--) if ($pos.node(depth).type.name === "table") return true
    return false
  })
}

const BasicTable = Table.extend({
  // 表格仅作为文档正文块存在，避免混入列表/引用后被旧的非表格导出路径压平成文字。
  group: "novelTable",
  addCommands() {
    const parent = this.parent!()
    return {
      ...parent,
      insertTable: (options = {}) => (context) => {
        if (selectionTouchesTable(context.state.selection) || !isTableSizeAllowed(options.rows ?? 3, options.cols ?? 3)) return false
        if (context.dispatch && !context.tr.selection.empty) {
          // 菜单语义是插入而非替换：先收起正文选区，再让官方命令插表，避免无意删除原文和批注。
          context.tr.setSelection(Selection.near(context.tr.doc.resolve(context.tr.selection.to), -1))
        }
        return parent.insertTable!(options)(context)
      },
      // 不只隐藏按钮，也明确关闭官方扩展的合并入口；事务校验继续保护外部命令和拖放路径。
      mergeCells: () => () => false,
      splitCell: () => () => false,
      mergeOrSplit: () => () => false,
    }
  },
}).configure({ resizable: false, renderWrapper: true, cellMinWidth: 80, HTMLAttributes: { "data-novel-table": "true" } })

const TableClipboard = Extension.create({
  name: "novelTableClipboard",
  addProseMirrorPlugins() {
    // 缓存不可变 PM 表格节点的校验结果；编辑普通正文时不会重复序列化已有的大表格。
    const validated = new WeakMap<ProseMirrorNode, string | null>()
    let rejectedClipboard = false
    return [new Plugin({
      filterTransaction(transaction) {
        if (!transaction.docChanged) return true
        let error: string | null = null
        transaction.doc.descendants((node) => {
          if (error) return false
          if (node.type.name !== "table") return true
          if (!validated.has(node)) validated.set(node, validateNovelTables(node.toJSON()))
          error = validated.get(node) ?? null
          return false
        })
        if (error) notify(error)
        return !error
      },
      props: {
        handleDOMEvents: {
          paste(view, event) {
            const html = event.clipboardData?.getData("text/html") ?? ""
            const text = event.clipboardData?.getData("text/plain") ?? ""
            if ((/<table[\s>]/i.test(html) || text.includes("\t")) && Math.max(html.length, text.length) > TABLE_LIMITS.clipboardCharacters) {
              // 超大输入必须在默认粘贴前取消；返回空 Slice 会意外删除用户原先选中的正文。
              event.preventDefault()
              notify("表格剪贴板内容过大，请分批复制（每次不超过 100 万字符）。")
              return true
            }
            return false
          },
        },
        transformPastedHTML(html) {
          rejectedClipboard = /<table[\s>]/i.test(html) && html.length > TABLE_LIMITS.clipboardCharacters
          return normalizeTableClipboardHtml(html)
        },
        handlePaste() {
          // pasteHTML 等编程入口不触发 DOM paste 事件，也需要消费拒绝的输入，保护原选区。
          const rejected = rejectedClipboard
          rejectedClipboard = false
          return rejected
        },
        clipboardTextParser(text, $context, plain, view) {
          rejectedClipboard = false
          // 明确的“粘贴为纯文本”保留原行为；普通文本也不接管。只识别规则的制表符二维数据。
          if (plain || !text.includes("\t")) return null!
          if (text.length > TABLE_LIMITS.clipboardCharacters) {
            rejectedClipboard = true
            notify("表格剪贴板内容过大，请分批复制。")
            return ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(document.createElement("div"))
          }
          const rows = parseTableTsv(text)
          if (!rows || !isTableSizeAllowed(rows.length, rows[0].length)) {
            notify("制表符内容不规则或表格超限，已按文本粘贴。")
            return null!
          }
          const table = document.createElement("table")
          for (const row of rows) {
            const tr = table.insertRow()
            for (const value of row) tr.insertCell().append(textParagraph(document, value))
          }
          const container = document.createElement("div")
          container.append(table)
          return ProseMirrorDOMParser.fromSchema(view.state.schema).parseSlice(container, { context: $context })
        },
      },
    })]
  },
})

// paragraph+ 从文档模型上排除嵌套表格、建议卡片和复杂块；段落内普通文字格式继续沿用现有扩展。
export const novelTableExtensions = [BasicTable, TableRow, TableCell.extend({ content: "paragraph+" }), TableHeader.extend({ content: "paragraph+" }), TableClipboard]
