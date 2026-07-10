import StarterKit from "@tiptap/starter-kit"
import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { afterEach, describe, expect, it, vi } from "vitest"

import {
  RevisionMark,
  applyInsertedText,
  createRevisionCompositionController,
  markDeletedRange,
} from "@/components/doc/tiptap/extensions"
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

type CompositionController = ReturnType<typeof createRevisionCompositionController>

// 模拟 ProseMirror DOMObserver 派发的原生 IME transaction：除了把候选文本写进 state，
// 还必须携带 composition id，并让独立测试 controller 观察同一份 StepMap；真实插件会在 state.apply 中自动完成观察。
function browserInsert(
  editor: Editor,
  controller: CompositionController,
  from: number,
  to: number,
  text: string,
  compositionId = 1,
) {
  const tr = editor.state.tr
  if (text) {
    tr.replaceWith(from, to, editor.state.schema.text(text))
  } else {
    tr.delete(from, to)
  }
  tr.setSelection(TextSelection.create(tr.doc, from + text.length))
  tr.setMeta("composition", compositionId)
  controller.observeTransaction(tr)
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
const deletedText = (editor: Editor) =>
  segments(editor)
    .filter((s) => s.role === "deleted")
    .map((s) => s.text)
    .join("")

describe("修订 composition（中文输入法）路径", () => {
  it("场景E：用输入法替换原文，标记新文为 inserted、原文为 original", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "新文")
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
    browserInsert(editor, controller, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 3, 3, "补充")
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
    browserInsert(editor, controller, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 3, 3, "补充")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 5, 5, "内容")
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
    browserInsert(editor, controller, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    // 词1“补充”：start → 浏览器插入 → end 排队，但 finalize 还没执行（不 runTimers）
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 3, 3, "补充")
    controller.handleCompositionEnd(editor.view)

    // 词2“内容”：紧接着开始——controller 应在此刻先把“补充”补打成修订，而不是丢弃它
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 5, 5, "内容")
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

  it("场景I：IME 提交后立刻退格，先补 inserted 再删除，不产生 deleted 修订", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "错")
    controller.handleCompositionEnd(editor.view)

    // 真实用户会在 compositionend 的 setTimeout(0) 补标前马上按 Backspace；
    // 删除键处理必须先 flush pending composition，否则“错”会被误判为原文并留下红色删除修订。
    controller.flushPendingFinalize(editor.view)
    markDeletedRange(editor.state, { from: 1, to: 2 }, OPTIONS, (tr) => editor.view.dispatch(tr))

    expect(insertedText(editor)).toBe("")
    expect(originalText(editor)).toBe("原文")
    expect(deletedText(editor)).toBe("")
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    editor.destroy()
  })

  it("场景J：pending finalize 前选区移动，不会把其它段落误标为 inserted", () => {
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "原文" }] },
          { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "新")
    controller.handleCompositionEnd(editor.view)

    // 模拟用户在异步补标执行前点击到第二段；补标范围必须仍只覆盖“新”，不能读取新的 selection。
    setSelection(editor, 5)
    vi.runOnlyPendingTimers()

    expect(insertedText(editor)).toBe("新")
    expect(originalText(editor)).toBe("原文")
    expect(segments(editor).find((segment) => segment.text.includes("第二段"))?.role).toBeNull()
    expect(editor.state.selection.from).toBeGreaterThan(2)
    vi.useRealTimers()
    editor.destroy()
  })

  it("取消 composition 且文档没有变化时不复制原文、不生成修订", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(editor.state.doc.textContent).toBe("原文")
    expect(revisionIdCount(editor)).toBe(0)
    vi.useRealTimers()
    editor.destroy()
  })

  it("选中原文后由 IME 提交空内容时恢复底稿并生成 delete 修订", () => {
    const editor = makeEditor("原文")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(editor.state.doc.textContent).toBe("原文")
    expect(deletedText(editor)).toBe("原文")
    expect(insertedText(editor)).toBe("")
    vi.useRealTimers()
    editor.destroy()
  })

  it("光标处发生等长 reconversion 时按 StepMap 捕获光标前真实替换范围", () => {
    const editor = makeEditor("原文后续")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // compositionstart 时只有光标；输入法实际把光标前“原文”等长替换为“新文”，全文长度完全不变。
    setSelection(editor, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "新文")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(insertedText(editor)).toBe("新文")
    expect(originalText(editor)).toBe("原文")
    expect(editor.state.doc.textContent).toContain("后续")
    vi.useRealTimers()
    editor.destroy()
  })

  it("同一 composition 的多轮 preedit 只保留最终候选文本", () => {
    const editor = makeEditor("")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 1, "z", 7)
    browserInsert(editor, controller, 1, 2, "zh", 7)
    browserInsert(editor, controller, 1, 3, "中", 7)
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    expect(editor.state.doc.textContent).toBe("中")
    expect(insertedText(editor)).toBe("中")
    expect(revisionIdCount(editor)).toBe(1)
    vi.useRealTimers()
    editor.destroy()
  })

  it("pending replacement finalize 后用 Mapping 把后续输入坐标保持在第二段", () => {
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", content: [{ type: "text", text: "abcdefghij" }] },
          { type: "paragraph", content: [{ type: "text", text: "第二段" }] },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 11)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 11, "新")
    controller.handleCompositionEnd(editor.view)

    // 模拟下一次 handleTextInput 已经拿到 flush 前的第二段坐标；finalize 会在第一段插回十个原文字母。
    const secondParagraphEndBeforeFinalize = editor.state.doc.content.size - 1
    setSelection(editor, secondParagraphEndBeforeFinalize)
    const finalize = controller.flushPendingFinalize(editor.view)

    expect(finalize).not.toBeNull()
    const mappedInputPos = finalize?.mapping.map(secondParagraphEndBeforeFinalize, 1) ?? secondParagraphEndBeforeFinalize
    applyInsertedText(editor.view, "X", { from: mappedInputPos, to: mappedInputPos }, OPTIONS)

    const paragraphs = editor.state.doc.content.content.map((node) => node.textContent)
    expect(paragraphs[0]).not.toContain("X")
    expect(paragraphs[1]).toContain("X")
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    editor.destroy()
  })

  it("IME 替换混合历史修订时保留既有 deleted 身份，只把普通底稿标成新的 original", () => {
    const existingDeletedAttrs = {
      id: "revision_deleted_existing",
      groupId: "revision_group_deleted_existing",
      kind: "delete",
      role: "deleted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "旧", marks: [{ type: "revision", attrs: existingDeletedAttrs }] },
              { type: "text", text: "原" },
            ],
          },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // 真实审稿文档会同时存在历史 deleted 与普通底稿。IME 替换整段后，旧修订必须原样恢复，
    // 不能因为给普通底稿补 original mark 而被同一个互斥 revision mark 覆盖掉。
    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "新")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    const result = segments(editor)
    const inserted = result.find((segment) => segment.text === "新")
    const existingDeleted = result.find((segment) => segment.text === "旧")
    const restoredPlainOriginal = result.find((segment) => segment.text === "原")

    expect(existingDeleted).toMatchObject({
      id: existingDeletedAttrs.id,
      kind: "delete",
      role: "deleted",
    })
    expect(restoredPlainOriginal).toMatchObject({
      id: inserted?.id,
      kind: "replace",
      role: "original",
    })
    vi.useRealTimers()
    editor.destroy()
  })

  it("IME 清空混合历史修订时保留旧 deleted 身份，只把普通底稿标成新的 delete", () => {
    const existingDeletedAttrs = {
      id: "revision_deleted_before_empty_commit",
      groupId: "revision_group_deleted_before_empty_commit",
      kind: "delete",
      role: "deleted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "旧", marks: [{ type: "revision", attrs: existingDeletedAttrs }] },
              { type: "text", text: "原" },
            ],
          },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // 输入法把可见选区提交为空时，native transaction 会暂时真删整段；finalize 必须逐段恢复：
    // 历史 deleted 原样回来，只有普通“原”获得本次新 delete 身份，不能把两段合并成同一个 id。
    setSelection(editor, 1, 3)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 3, "")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    const result = segments(editor)
    const existingDeleted = result.find((segment) => segment.text === "旧")
    const newlyDeleted = result.find((segment) => segment.text === "原")

    expect(editor.state.doc.textContent).toBe("旧原")
    expect(existingDeleted).toMatchObject({
      id: existingDeletedAttrs.id,
      kind: "delete",
      role: "deleted",
    })
    expect(newlyDeleted).toMatchObject({ kind: "delete", role: "deleted" })
    expect(newlyDeleted?.id).not.toBe(existingDeletedAttrs.id)
    vi.useRealTimers()
    editor.destroy()
  })

  it("光标紧邻 inserted 但 IME reconversion 实际替换右侧普通底稿时创建新的 replace 修订", () => {
    const existingInsertedAttrs = {
      id: "revision_inserted_existing",
      groupId: "revision_group_inserted_existing",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "A", marks: [{ type: "revision", attrs: existingInsertedAttrs }] },
              { type: "text", text: "中" },
            ],
          },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // compositionstart 的 DOM 选区可能只是边界光标，但输入法 reconversion 的真实 StepMap 会替换右侧底稿。
    // 修订归属必须以真实 originalRange 为准，不能仅凭光标左邻 inserted 就吞掉原文。
    setSelection(editor, 2)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 2, 3, "新")
    controller.handleCompositionEnd(editor.view)
    vi.runOnlyPendingTimers()

    const result = segments(editor)
    const existingInserted = result.find((segment) => segment.text === "A")
    const replacementInserted = result.find((segment) => segment.text === "新")
    const replacementOriginal = result.find((segment) => segment.text === "中")

    expect(existingInserted).toMatchObject({
      id: existingInsertedAttrs.id,
      kind: "insert",
      role: "inserted",
    })
    expect(replacementInserted).toMatchObject({ kind: "replace", role: "inserted" })
    expect(replacementInserted?.id).not.toBe(existingInsertedAttrs.id)
    expect(replacementOriginal).toMatchObject({
      id: replacementInserted?.id,
      kind: "replace",
      role: "original",
    })
    vi.useRealTimers()
    editor.destroy()
  })

  it("pending replacement finalize 后紧邻的新输入仍留在 inserted 末尾，不越过恢复的 original", () => {
    const editor = makeEditor("abc")
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    setSelection(editor, 1, 4)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 4, "X")
    controller.handleCompositionEnd(editor.view)

    // 模拟 compositionend 后浏览器立刻送来下一次直接输入。旧坐标 2 同时是新文末尾和
    // finalize 插回原文的位置；映射必须选择插入点左侧，否则后续文字会越过 original 跑到其后方。
    const nextInputPosBeforeFinalize = 2
    const finalize = controller.flushPendingFinalize(editor.view)

    expect(finalize).not.toBeNull()
    const assoc = finalize?.stickyBoundary === nextInputPosBeforeFinalize ? -1 : 1
    const nextInputPos = finalize?.mapping.map(nextInputPosBeforeFinalize, assoc) ?? nextInputPosBeforeFinalize
    applyInsertedText(editor.view, "Y", { from: nextInputPos, to: nextInputPos }, OPTIONS)

    expect(editor.state.doc.textContent).toBe("XYabc")
    expect(insertedText(editor)).toBe("XY")
    expect(originalText(editor)).toBe("abc")
    expect(revisionIdCount(editor)).toBe(1)
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
    editor.destroy()
  })

  it("跨段选择多个不同 inserted 后由 composition 提交空内容时安全物理删除，不恢复非法开放 Slice", () => {
    const makeInsertedAttrs = (id: string) => ({
      id,
      groupId: `${id}_group`,
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    })
    const editor = new Editor({
      extensions: [StarterKit, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "A", marks: [{ type: "revision", attrs: makeInsertedAttrs("revision_insert_a") }] },
            ],
          },
          {
            type: "paragraph",
            content: [
              { type: "text", text: "B", marks: [{ type: "revision", attrs: makeInsertedAttrs("revision_insert_b") }] },
            ],
          },
        ],
      },
    })
    vi.useFakeTimers()
    const controller = createRevisionCompositionController(() => OPTIONS)

    // 跨段 Slice 的 openStart/openEnd 都大于零；过滤掉全部 inserted 后必须退化成合法的空 Slice，
    // 不能保留“空 content + 开放深度”的非法组合并让 ProseMirror Fitter 在 finalize 时崩溃。
    setSelection(editor, 1, 5)
    controller.handleCompositionStart(editor.view)
    browserInsert(editor, controller, 1, 5, "")
    controller.handleCompositionEnd(editor.view)

    expect(() => vi.runOnlyPendingTimers()).not.toThrow()
    expect(editor.state.doc.textContent).toBe("")
    expect(insertedText(editor)).toBe("")
    expect(revisionIdCount(editor)).toBe(0)
    vi.useRealTimers()
    editor.destroy()
  })
})
