import StarterKit from "@tiptap/starter-kit"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it, vi } from "vitest"

import { RevisionMark, createRevisionCompositionController } from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

const CREATED_BY: NovelCreatedBy = { userId: "e1", role: "editor", nameSnapshot: "编辑甲" }
const OPTIONS = { enabled: true, createdBy: CREATED_BY }

afterEach(() => {
  vi.useRealTimers()
})

function makeEditor(text: string) {
  return new Editor({
    extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
    content: { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] },
  })
}

function setSelection(editor: Editor, from: number, to: number = from) {
  editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, from, to)))
}

// 模拟浏览器 IME 提交：把 [from,to] 替换为无 mark 的纯文本（inclusive:false 边界不继承 revision mark），光标落到末尾
function browserInsert(editor: Editor, from: number, to: number, text: string) {
  const tr = editor.state.tr
  if (text) {
    tr.replaceWith(from, to, editor.state.schema.text(text))
  } else {
    tr.delete(from, to)
  }
  tr.setSelection(TextSelection.create(tr.doc, from + text.length))
  editor.view.dispatch(tr)
}

function segments(editor: Editor) {
  const segs: Array<{ text: string; id: string | null; kind: string | null; role: string | null }> = []
  editor.state.doc.descendants((node) => {
    if (node.isText && node.text) {
      const rev = node.marks.find((m) => m.type.name === "revision")
      segs.push({
        text: node.text,
        id: (rev?.attrs.id as string) ?? null,
        kind: (rev?.attrs.kind as string) ?? null,
        role: (rev?.attrs.role as string) ?? null,
      })
    }
    return true
  })
  return segs
}

const insertedText = (editor: Editor) =>
  segments(editor)
    .filter((s) => s.role === "inserted")
    .map((s) => s.text)
    .join("")

const originalText = (editor: Editor) =>
  segments(editor)
    .filter((s) => s.role === "original")
    .map((s) => s.text)
    .join("")

const revisionIdCount = (editor: Editor) => new Set(segments(editor).filter((s) => s.id).map((s) => s.id)).size

describe("修订 composition（中文输入法）路径", () => {
  it("场景E：用输入法替换原文，标记新文为 inserted、原文为 original", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(insertedText(editor)).toBe("新文")
    expect(originalText(editor)).toBe("原文")
    vi.useRealTimers()
    editor.destroy()
  })

  it("场景F：替换后在新文末尾继续用输入法输入（正常时序）", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 3, 3, "补充")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(insertedText(editor)).toBe("新文补充")
    expect(originalText(editor)).toBe("原文")
    expect(revisionIdCount(editor)).toBe(1)
    vi.useRealTimers()
    editor.destroy()
  })

  it("场景G：连续两段输入法输入，两次 finalize 均按时执行", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 3, 3, "补充")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 5, 5, "内容")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(insertedText(editor)).toBe("新文补充内容")
    expect(originalText(editor)).toBe("原文")
    expect(revisionIdCount(editor)).toBe(1)
    vi.useRealTimers()
    editor.destroy()
  })

  it("场景H（核心回归）：IME 连打，上一段 finalize 未执行就开始下一段，不丢失之前的修订", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // 先用输入法替换得到一处替换修订
    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    // 词1“补充”：start → 浏览器插入 → end 排队，但 finalize 还没执行（不 runTimers）
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 3, 3, "补充")
    controller.handleCompositionEnd(editor.view)

    // 词2“内容”：紧接着开始——controller 应在此刻先把“补充”补打成修订，而不是丢弃它
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, 5, 5, "内容")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    // 修复后：新文/补充/内容 全部为同一条 inserted 修订；原文仍为 original
    expect(insertedText(editor)).toBe("新文补充内容")
    expect(originalText(editor)).toBe("原文")
    expect(revisionIdCount(editor)).toBe(1)
    expect(segments(editor).some((s) => s.text === "补充" && s.role === null)).toBe(false)
    vi.useRealTimers()
    editor.destroy()
  })
})
