import { Editor } from "@tiptap/core"
import StarterKit from "@tiptap/starter-kit"
import { describe, expect, it } from "vitest"

import { CommentMark, updateCommentBody } from "@/components/doc/tiptap/extensions"

const COMMENT_ID = "comment_1"
const CREATED_BY = { userId: "editor-1", role: "editor", nameSnapshot: "编辑甲" }
const CREATED_AT = "2026-07-01T08:00:00.000Z"

function makeEditor() {
  // 用加粗 mark 主动把同一条批注拆成两个文本片段，覆盖真实稿件中批注与普通格式重叠的场景。
  return new Editor({
    extensions: [StarterKit, CommentMark],
    content: {
      type: "doc",
      content: [
        {
          type: "paragraph",
          content: [
            {
              type: "text",
              text: "需要",
              marks: [
                {
                  type: "comment",
                  attrs: {
                    id: COMMENT_ID,
                    kind: "normal",
                    body: "原批注",
                    createdBy: CREATED_BY,
                    createdAt: CREATED_AT,
                    updatedAt: null,
                  },
                },
              ],
            },
            {
              type: "text",
              text: "修改",
              marks: [
                { type: "bold" },
                {
                  type: "comment",
                  attrs: {
                    id: COMMENT_ID,
                    kind: "normal",
                    body: "原批注",
                    createdBy: CREATED_BY,
                    createdAt: CREATED_AT,
                    updatedAt: null,
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  })
}

function collectCommentAttrs(editor: Editor) {
  const attrs: Array<Record<string, unknown>> = []

  // 收集每个文本片段上的批注属性，验证跨片段更新不会遗漏任何一个 mark。
  editor.state.doc.descendants((node) => {
    if (!node.isText) {
      return
    }

    node.marks.forEach((mark) => {
      if (mark.type.name === "comment") {
        attrs.push(mark.attrs)
      }
    })
  })

  return attrs
}

describe("updateCommentBody", () => {
  it("修改同一批注的全部文本片段，并保留原始创建信息", () => {
    const editor = makeEditor()

    expect(updateCommentBody(editor, COMMENT_ID, "  原批注，补充说明。  ")).toBe(true)

    const attrs = collectCommentAttrs(editor)

    expect(attrs).toHaveLength(2)
    attrs.forEach((item) => {
      expect(item.body).toBe("原批注，补充说明。")
      expect(item.id).toBe(COMMENT_ID)
      expect(item.createdBy).toEqual(CREATED_BY)
      expect(item.createdAt).toBe(CREATED_AT)
      expect(item.updatedAt).toEqual(expect.any(String))
    })

    // 批注内容修改不能破坏与其重叠的正文格式。
    expect(editor.state.doc.textBetween(0, editor.state.doc.content.size)).toBe("需要修改")
    expect(editor.state.doc.child(0).child(1).marks.some((mark) => mark.type.name === "bold")).toBe(true)
    editor.destroy()
  })

  it("拒绝空内容和不存在的批注，不改变文档", () => {
    const editor = makeEditor()
    const before = editor.getJSON()

    expect(updateCommentBody(editor, COMMENT_ID, "   ")).toBe(false)
    expect(updateCommentBody(editor, "comment_missing", "补充说明")).toBe(false)
    expect(editor.getJSON()).toEqual(before)
    editor.destroy()
  })
})
