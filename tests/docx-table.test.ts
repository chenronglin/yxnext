import JSZip from "jszip"
import { describe, expect, it } from "vitest"
import { buildDocxBuffer } from "@/server/shared/docx-export"
import type { NovelBlockNode } from "@/lib/novel-doc"
import { makeTable, makeTableDoc } from "./support/table-fixtures"

describe("Word 基础表格导出", () => {
  it("生成真实 Word 行列和表头，空格保留且协作删除内容不泄漏", async () => {
    const document = makeTableDoc(makeTable([["名称", "值"], ["新值", ""]]))
    const paragraph = ((document.content[0].content![1] as NovelBlockNode).content![0] as NovelBlockNode).content![0] as NovelBlockNode
    paragraph.content!.push({ type: "text", text: "已删除内容", marks: [{ type: "revision", attrs: { role: "deleted", id: "r1" } }] })
    const buffer = await buildDocxBuffer({ title: "项目", sections: [{ title: "章节", contentJson: document }] })
    const archive = await JSZip.loadAsync(buffer)
    const xml = await archive.file("word/document.xml")!.async("string")
    expect(xml.match(/<w:tbl>/g)).toHaveLength(1)
    expect(xml.match(/<w:tr>/g)).toHaveLength(2)
    expect(xml.match(/<w:tc>/g)).toHaveLength(4)
    expect(xml).toContain("w:tblHeader")
    expect(xml).toContain("新值")
    expect(xml).not.toContain("已删除内容")
    expect(xml).not.toContain("w:gridSpan")
    expect(xml).not.toContain("w:vMerge")
  })
})
