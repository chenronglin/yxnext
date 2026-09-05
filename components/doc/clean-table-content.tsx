import { deriveNovelDocProjection, extractCleanNovelDocBlocks, isNovelTextNode, type NovelBlockNode, type NovelContentNode, type NovelDocJson } from "@/lib/novel-doc"

function cellText(nodes: NovelContentNode[] = []): string {
  return nodes.map((node) => isNovelTextNode(node) ? node.text : node.type === "hardBreak" ? "\n" : cellText(node.content)).join("")
}

export function CleanTableContent({ document }: { document: NovelDocJson }) {
  // React 直接输出文本与结构，不注入剪贴板 HTML；非表格正文沿用清稿页原有的段落展示方式。
  return extractCleanNovelDocBlocks(document).map((block, index) => {
    if (block.type !== "table") {
      return deriveNovelDocProjection({ ...document, content: [block] }).cleanText.split(/\n{2,}/).map((text) => text.trim()).filter(Boolean).map((text, paragraph) => (
        <p key={`${index}-${paragraph}`} className="text-[15px] leading-loose text-foreground/90">{text}</p>
      ))
    }
    const rows = (block.content ?? []).filter((row): row is NovelBlockNode => !isNovelTextNode(row))
    const columns = rows[0]?.content?.length ?? 1
    return (
      <div key={index} className="novel-clean-table">
        <table style={{ minWidth: `${columns * 5}rem` }} aria-label="正文表格">
          <tbody>{rows.map((row, rowIndex) => <tr key={rowIndex}>
            {(row.content ?? []).filter((cell): cell is NovelBlockNode => !isNovelTextNode(cell)).map((cell, column) => {
              const Cell = cell.type === "tableHeader" ? "th" : "td"
              return <Cell key={column}>{(cell.content ?? []).map((paragraph, paragraphIndex) => <p key={paragraphIndex}>{isNovelTextNode(paragraph) ? paragraph.text : cellText(paragraph.content)}</p>)}</Cell>
            })}
          </tr>)}</tbody>
        </table>
      </div>
    )
  })
}
