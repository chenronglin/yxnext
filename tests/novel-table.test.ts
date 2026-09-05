import { describe, expect, it } from "vitest"
import { deriveNovelDocProjection, extractCleanNovelDocBlocks, type NovelBlockNode } from "@/lib/novel-doc"
import { isTableSizeAllowed, parseTableTsv, validateNovelTables } from "@/lib/novel-table"
import { makeTable, makeTableDoc } from "./support/table-fixtures"

describe("表格数据契约", () => {
  it("表格文本投影保留空列与行界，清稿清理协作标记但保留空单元格", () => {
    const document = makeTableDoc(makeTable([["姓名", "数量", "备注"], ["甲", "3", ""]]))
    const cell = document.content[0].content![1] as NovelBlockNode
    const paragraph = (cell.content![0] as NovelBlockNode).content![0] as NovelBlockNode
    paragraph.content = [
      { type: "text", text: "旧值", marks: [{ type: "revision", attrs: { id: "r1", role: "deleted" } }] },
      { type: "text", text: "新值", marks: [{ type: "bold" }, { type: "comment", attrs: { id: "c1" } }, { type: "revision", attrs: { id: "r2", role: "inserted" } }] },
    ]
    const projection = deriveNovelDocProjection(document)
    expect(projection.plainText).toBe("姓名\t数量\t备注\n旧值新值\t3\t")
    expect(projection.cleanText).toBe("姓名\t数量\t备注\n新值\t3\t")
    expect(projection.wordCount).toBe(9)
    expect(projection.commentCount).toBe(1)
    const clean = extractCleanNovelDocBlocks(document)
    expect(validateNovelTables({ type: "doc", content: clean })).toBeNull()
    expect(JSON.stringify(clean)).not.toContain("旧值")
    expect(JSON.stringify(clean)).not.toContain('"type":"revision"')
    expect(JSON.stringify(clean)).not.toContain('"type":"comment"')
    expect(JSON.stringify(clean)).toContain('"type":"bold"')
    expect(JSON.stringify(document)).toContain("旧值")
  })

  it("服务端拒绝不完整行、孤立节点、合并和嵌套", () => {
    expect(validateNovelTables(makeTableDoc())).toBeNull()
    expect(validateNovelTables(makeTableDoc(makeTable([["甲", "乙"], ["丙"]])))).toBeTruthy()
    expect(validateNovelTables({ content: [{ type: "tableCell", content: [{ type: "paragraph" }] }] })).toBeTruthy()
    const merged = makeTableDoc()
    const cell = (merged.content[0].content![0] as NovelBlockNode).content![0] as NovelBlockNode
    cell.attrs!.colspan = 2
    expect(validateNovelTables(merged)).toBe("不支持合并单元格")
    cell.attrs!.colspan = 1
    cell.content = [makeTable()]
    expect(validateNovelTables(merged)).toBeTruthy()
  })

  it("行列和总单元格分别限流，长文档及最大合法表格仍可保存", () => {
    expect(isTableSizeAllowed(100, 20)).toBe(true)
    expect(isTableSizeAllowed(100, 21)).toBe(false)
    expect(isTableSizeAllowed(1, 31)).toBe(false)
    expect(isTableSizeAllowed(101, 1)).toBe(false)
    expect(isTableSizeAllowed(1.5, 2)).toBe(false)
    const document = makeTableDoc(makeTable(Array.from({ length: 100 }, () => Array.from({ length: 20 }, () => "内容"))))
    document.content.unshift(...Array.from({ length: 5000 }, () => ({ type: "paragraph", content: [{ type: "text" as const, text: "长文档" }] })))
    expect(validateNovelTables(document)).toBeNull()
    expect(deriveNovelDocProjection(document).wordCount).toBe(19000)
  })

  it("TSV 支持 CRLF、双引号转义，拒绝未闭合及不规则数据", () => {
    expect(parseTableTsv('甲\t"含""引号"\r\n乙\t\r\n')).toEqual([["甲", '含"引号'], ["乙", ""]])
    expect(parseTableTsv('甲\t"未闭合')).toBeNull()
    expect(parseTableTsv('甲\t"闭合"多余内容')).toBeNull()
    expect(parseTableTsv("甲\t乙\n丙")).toBeNull()
    expect(parseTableTsv("普通正文")).toBeNull()
  })
})
