// 浏览器粘贴、交互命令和服务端保存共享同一边界，避免出现“能编辑却不能保存”的表格。
export const TABLE_LIMITS = { rows: 100, columns: 30, cells: 2000, clipboardCharacters: 1_000_000 } as const

export function isTableSizeAllowed(rows: number, columns: number) {
  return Number.isInteger(rows) && Number.isInteger(columns) && rows > 0 && columns > 0 &&
    rows <= TABLE_LIMITS.rows && columns <= TABLE_LIMITS.columns && rows * columns <= TABLE_LIMITS.cells
}

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 只新增表格相关校验，不改变已有非表格节点的兼容规则。迭代遍历避免深层 JSON 消耗调用栈。
export function validateNovelTables(root: unknown): string | null {
  const pending: Array<{ node: unknown; parent: string; inTable: boolean }> = [{ node: root, parent: "", inTable: false }]
  while (pending.length) {
    const { node, parent, inTable } = pending.pop()!
    if (!record(node)) continue
    const type = String(node.type)
    const children = Array.isArray(node.content) ? node.content : []
    if (type === "table") {
      if (inTable) return "不支持嵌套表格"
      if (parent && parent !== "doc") return "表格必须直接位于文档正文中"
      const width = record(children[0]) && Array.isArray(children[0].content) ? children[0].content.length : 0
      if (!isTableSizeAllowed(children.length, width)) return "表格最多支持 100 行、30 列及 2000 个单元格"
      if (children.some((row) => !record(row) || row.type !== "tableRow" || !Array.isArray(row.content) || row.content.length !== width)) {
        return "表格必须是行列完整的基础二维表格"
      }
    }
    if (type === "tableRow" && (parent !== "table" || children.some((cell) => !record(cell) || !["tableCell", "tableHeader"].includes(String(cell.type))))) {
      return "表格行必须包含完整单元格"
    }
    if (type === "tableCell" || type === "tableHeader") {
      if (parent !== "tableRow") return "单元格必须位于表格行内"
      const attrs = record(node.attrs) ? node.attrs : {}
      if ((attrs.colspan !== undefined && attrs.colspan !== 1) || (attrs.rowspan !== undefined && attrs.rowspan !== 1)) return "不支持合并单元格"
      if (attrs.colwidth != null && (!Array.isArray(attrs.colwidth) || attrs.colwidth.length !== 1 || !Number.isFinite(attrs.colwidth[0]) || attrs.colwidth[0] <= 0 || attrs.colwidth[0] > 2000)) return "单元格宽度无效"
      if (!children.length || children.some((child) => !record(child) || child.type !== "paragraph")) return "单元格仅支持基础段落内容"
    }
    if (inTable && type === "paragraph" && children.some((child) => !record(child) || !["text", "hardBreak"].includes(String(child.type)))) {
      return "单元格段落仅支持文字和换行"
    }
    for (const child of children) pending.push({ node: child, parent: type, inTable: inTable || type === "table" })
  }
  return null
}

// Excel/WPS 的纯文本剪贴板采用 TSV；带换行或制表符的单元格会用双引号包裹，双引号自身成对转义。
export function parseTableTsv(text: string): string[][] | null {
  if (!text.includes("\t") || text.length > TABLE_LIMITS.clipboardCharacters) return null
  const rows: string[][] = []
  let row: string[] = []
  let value = ""
  let quoted = false
  let quoteClosed = false
  const source = text.replace(/\r\n?/g, "\n")
  for (let index = 0; index < source.length; index++) {
    const char = source[index]
    // 引号闭合后只能接分隔符，异常 TSV 不擅自删引号或拼接文字，交由原文降级保留。
    if (quoteClosed && char !== "\t" && char !== "\n") return null
    if (char === '"' && (quoted || value === "")) {
      if (quoted && source[index + 1] === '"') { value += '"'; index++ }
      else { quoteClosed = quoted; quoted = !quoted }
    } else if (!quoted && (char === "\t" || char === "\n")) {
      row.push(value)
      value = ""
      quoteClosed = false
      if (char === "\n") { rows.push(row); row = [] }
    } else value += char
  }
  if (quoted) return null
  if (value || row.length || !source.endsWith("\n")) { row.push(value); rows.push(row) }
  return rows.length && rows[0].length > 1 && rows.every((item) => item.length === rows[0].length) ? rows : null
}
