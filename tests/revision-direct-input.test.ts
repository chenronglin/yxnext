import StarterKit from "@tiptap/starter-kit"
import { Editor } from "@tiptap/core"
import { Fragment, Slice } from "@tiptap/pm/model"
import { describe, expect, it } from "vitest"

import {
  CommentMark,
  RevisionMark,
  applyInsertedSlice,
  applyInsertedText,
} from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

// 直接输入（handleTextInput）路径的连续编辑回归测试：英文/数字键入与粘贴会走这里，
// 与 composition（中文输入法）路径互补。重点验证“在新增/替换区域继续输入不丢失修订”。

const CREATED_BY: NovelCreatedBy = { userId: "e1", role: "editor", nameSnapshot: "编辑甲" }

function makeEditor(text: string) {
  return new Editor({
    extensions: [StarterKit, CommentMark, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
    content: { type: "doc", content: [{ type: "paragraph", content: text ? [{ type: "text", text }] : [] }] },
  })
}

// 直接调用 applyInsertedText 模拟 handleTextInput（浏览器直接输入）路径
function typeText(editor: Editor, text: string, from: number, to: number = from) {
  applyInsertedText(editor.view, text, { from, to }, { enabled: true, createdBy: CREATED_BY })
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

  it("多段粘贴保留段落结构，并让所有粘贴文字共享一条 inserted 修订", () => {
    const editor = makeEditor("")
    const paragraph = editor.state.schema.nodes.paragraph
    const slice = new Slice(
      Fragment.fromArray([
        paragraph.create(null, editor.state.schema.text("第一段")),
        paragraph.create(null, editor.state.schema.text("第二段")),
      ]),
      0,
      0,
    )

    const applied = applyInsertedSlice(
      editor.view,
      slice,
      { from: 1, to: 1 },
      { enabled: true, createdBy: CREATED_BY },
    )

    expect(applied).toBe(true)
    expect(editor.state.doc.childCount).toBe(2)
    expect(editor.state.doc.child(0).textContent).toBe("第一段")
    expect(editor.state.doc.child(1).textContent).toBe("第二段")
    expect(insertedText(editor)).toBe("第一段第二段")
    expect(revisionIdCount(editor)).toBe(1)
    editor.destroy()
  })

  it("粘贴外部 Slice 时移除旧 comment/revision 身份但保留普通格式", () => {
    const editor = makeEditor("")
    const schema = editor.state.schema
    const bold = schema.marks.bold.create()
    const foreignRevision = schema.marks.revision.create({
      id: "foreign_revision",
      groupId: "foreign_group",
      kind: "delete",
      role: "deleted",
      createdBy: CREATED_BY,
      createdAt: "2026-01-01T00:00:00.000Z",
    })
    const foreignComment = schema.marks.comment.create({
      id: "foreign_comment",
      kind: "normal",
      body: "外部批注",
      createdBy: CREATED_BY,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: null,
    })
    const slice = new Slice(
      Fragment.from(schema.nodes.paragraph.create(null, schema.text("外部文字", [bold, foreignRevision, foreignComment]))),
      0,
      0,
    )

    applyInsertedSlice(editor.view, slice, { from: 1, to: 1 }, { enabled: true, createdBy: CREATED_BY })

    const pastedTextNode = editor.state.doc.firstChild?.firstChild
    const revision = pastedTextNode?.marks.find((mark) => mark.type.name === "revision")

    expect(pastedTextNode?.marks.some((mark) => mark.type.name === "bold")).toBe(true)
    expect(pastedTextNode?.marks.some((mark) => mark.type.name === "comment")).toBe(false)
    expect(revision?.attrs.id).not.toBe("foreign_revision")
    expect(revision?.attrs.role).toBe("inserted")
    editor.destroy()
  })

  it("直接输入覆盖纯历史 deleted 展示层时创建 insert，并保留旧修订身份", () => {
    const existingDeletedAttrs = {
      id: "revision_deleted_direct_input",
      groupId: "revision_group_deleted_direct_input",
      kind: "delete",
      role: "deleted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const editor = new Editor({
      extensions: [StarterKit, CommentMark, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "旧", marks: [{ type: "revision", attrs: existingDeletedAttrs }] }],
          },
        ],
      },
    })

    // deleted/original 是审计展示层，不是本次输入真正替换的底稿；新文字应是独立 insert，
    // 旧 deleted 继续保留原 id，不能产生“replace 却没有 original”的孤立修订。
    typeText(editor, "新", 1, 2)

    const result = segments(editor)
    expect(result.find((segment) => segment.text === "新")).toMatchObject({ kind: "insert", role: "inserted" })
    expect(result.find((segment) => segment.text === "旧")).toMatchObject({
      id: existingDeletedAttrs.id,
      kind: "delete",
      role: "deleted",
    })
    editor.destroy()
  })

  it("粘贴覆盖纯历史 original 展示层时创建 insert，并保留旧 replacement 身份", () => {
    const existingOriginalAttrs = {
      id: "revision_original_before_paste",
      groupId: "revision_group_original_before_paste",
      kind: "replace",
      role: "original",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const editor = new Editor({
      extensions: [StarterKit, CommentMark, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [{ type: "text", text: "旧", marks: [{ type: "revision", attrs: existingOriginalAttrs }] }],
          },
        ],
      },
    })
    const slice = new Slice(Fragment.from(editor.state.schema.text("粘")), 0, 0)

    applyInsertedSlice(editor.view, slice, { from: 1, to: 2 }, { enabled: true, createdBy: CREATED_BY })

    const result = segments(editor)
    expect(result.find((segment) => segment.text === "粘")).toMatchObject({ kind: "insert", role: "inserted" })
    expect(result.find((segment) => segment.text === "旧")).toMatchObject({
      id: existingOriginalAttrs.id,
      kind: "replace",
      role: "original",
    })
    editor.destroy()
  })

  it("直接输入覆盖多条不同 inserted 修订时物理移除旧新增文字，不生成 delete/original", () => {
    const firstInserted = {
      id: "revision_inserted_first",
      groupId: "revision_group_inserted_first",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const secondInserted = {
      ...firstInserted,
      id: "revision_inserted_second",
      groupId: "revision_group_inserted_second",
    }
    const editor = new Editor({
      extensions: [StarterKit, CommentMark, RevisionMark.configure({ enabled: true, createdBy: CREATED_BY })],
      content: {
        type: "doc",
        content: [
          {
            type: "paragraph",
            content: [
              { type: "text", text: "A", marks: [{ type: "revision", attrs: firstInserted }] },
              { type: "text", text: "B", marks: [{ type: "revision", attrs: secondInserted }] },
            ],
          },
        ],
      },
    })

    typeText(editor, "X", 1, 3)

    expect(editor.state.doc.textContent).toBe("X")
    expect(segments(editor)).toEqual([
      expect.objectContaining({ text: "X", kind: "insert", role: "inserted" }),
    ])
    editor.destroy()
  })
})
