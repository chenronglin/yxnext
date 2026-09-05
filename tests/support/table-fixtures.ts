import { createNovelDocV1, type NovelBlockNode } from "@/lib/novel-doc"

export function makeTable(rows = [["姓名", "数量"], ["甲", "3"]], header = true): NovelBlockNode {
  return {
    type: "table",
    attrs: {},
    content: rows.map((row, index) => ({
      type: "tableRow",
      content: row.map((text) => ({
        type: header && index === 0 ? "tableHeader" : "tableCell",
        attrs: { colspan: 1, rowspan: 1, colwidth: null },
        content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }],
      })),
    })),
  }
}

export function makeTableDoc(table = makeTable()) {
  return createNovelDocV1({ docId: "table_test", docType: "chapter", title: "表格专项", content: [table] })
}

// 合成标准夹具覆盖常见 HTML 结构；真实 Office/WPS 各平台版本仍需按文档中的人工矩阵验收。
export const OFFICE_TABLE_HTML = {
  excel: '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><!--StartFragment--><table><colgroup><col width="90"></colgroup><tr><td x:str>姓名</td><td>数量</td></tr><tr><td>甲</td><td x:fmla="=SUM(B1:B2)" x:num="3">3</td></tr></table><!--EndFragment--></body></html>',
  wps: '<meta charset="utf-8"><table style="border-collapse:collapse"><tbody><tr><td class="et1">姓名</td><td>数量</td></tr><tr><td>甲</td><td data-formula="=1+2"><span>3</span></td></tr></tbody></table>',
  word: '<p>表前正文</p><table class="MsoTableGrid"><tbody><tr><th><p class="MsoNormal">姓名</p></th><th><p>数量</p></th></tr><tr><td><p>甲</p></td><td><p>3</p></td></tr></tbody></table><p>表后正文</p>',
}
