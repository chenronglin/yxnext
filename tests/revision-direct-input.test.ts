import StarterKit from "@tiptap/starter-kit"
import { Editor } from "@tiptap/core"
import { describe, expect, it } from "vitest"

import { RevisionMark, applyInsertedText } from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

// 直接输入（handleTextInput）路径的连续编辑回归测试：英文/数字键入与粘贴会走这里，
// 与 composition（中文输入法）路径互补。重点验证“在新增/替换区域继续输入不丢失修订”。

const CREATED_BY: NovelCreatedBy = { userId: "e1", role: "editor", nameSnapshot: "编辑甲" }

function makeEditor(text: string) {
  return new Editor({
    extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
    content: { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] },
  })
}

// 直接调用 applyInsertedText 模拟 handleTextInput（浏览器直接输入）路径
function typeText(editor: Editor, text: string, from: number, to: number = from) {
  applyInsertedText(editor.view, text, { from, to }, { enabled: true, createdBy: CREATED_BY })
}

function segments(editor: Editor) {
  const segs: Array<{ text: string; id: string | null; role: string | null }> = []
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text) {
      const rev = node.marks.find((m) => m.type.name === "revision")
      segs.push({ text: node.text, id: (rev?.attrs.id as string) ?? null, role: (rev?.attrs.role as string) ?? null })
    }
    return true
  })
  return segs
}

const insertedText = (editor: Editor) =>
  segments(editor).filter((s) => s.role === "inserted").map((s) => s.text).join("")
const originalText = (editor: Editor) =>
  segments(editor).filter((s) => s.role === "original").map((s) => s.text).join("")
const revisionIdCount = (editor: Editor) => new Set(segments(editor).filter((s) => s.id).map((s) => s.id)).size

describe("修订直接输入（handleTextInput）路径", () => {
  it("替换原文后，在新文末尾继续输入并入同一条修订", () => {
    const editor = makeEditor("原文")
    typeText(editor, "新", 1, 3)
    typeText(editor, "增", 2, 2)

    expect(insertedText(editor)).toBe("新增")
    expect(originalText(editor)).toBe("原文")
    expect(revisionIdCount(editor)).toBe(1)
    editor.destroy()
  })

  it("替换原文后，在新文中间插入仍属同一条修订", () => {
    const editor = makeEditor("原文")
    typeText(editor, "新内容", 1, 3)
    typeText(editor, "X", 2, 2)

    expect(insertedText(editor)).toBe("新X内容")
    expect(originalText(editor)).toBe("原文")
    editor.destroy()
  })

  it("纯新增逐字输入合并为同一条 insert 修订", () => {
    const editor = makeEditor("")
    typeText(editor, "新", 1, 1)
    typeText(editor, "增", 2, 2)
    typeText(editor, "内", 3, 3)
    typeText(editor, "容", 4, 4)

    expect(insertedText(editor)).toBe("新增内容")
    expect(revisionIdCount(editor)).toBe(1)
    editor.destroy()
  })

  it("替换后逐字连续输入多字，原文修订完整保留", () => {
    const editor = makeEditor("原文")
    typeText(editor, "替", 1, 3)
    typeText(editor, "换", 2, 2)
    typeText(editor, "内", 3, 3)
    typeText(editor, "容", 4, 4)

    expect(insertedText(editor)).toBe("替换内容")
    expect(originalText(editor)).toBe("原文")
    expect(revisionIdCount(editor)).toBe(1)
    editor.destroy()
  })
})
