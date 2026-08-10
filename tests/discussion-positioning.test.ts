import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"

import { getActiveKeyFromSelection } from "@/components/doc/tiptap/discussion-sidebar"
import { createNovelEditorExtensions, getDiscussionHighlightDecorations } from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

const CREATED_BY: NovelCreatedBy = {
  userId: "editor-1",
  role: "editor",
  nameSnapshot: "编辑甲",
}

function createDiscussionEditor() {
  return new Editor({
    editable: false,
    extensions: createNovelEditorExtensions({
      trackChanges: false,
      createdBy: CREATED_BY,
    }),
    content: {
      type: "doc",
      attrs: {
        schemaVersion: 1,
        docId: "doc_discussion_positioning_test",
        docType: "chapter",
        title: "批注定位测试",
        createdAt: "2026-08-10T00:00:00.000Z",
        updatedAt: "2026-08-10T00:00:00.000Z",
      },
      content: [
        {
          type: "paragraph",
          attrs: { id: "block_p_1" },
          content: [
            {
              type: "text",
              text: "批注文字",
              marks: [
                {
                  type: "comment",
                  attrs: {
                    id: "same_business_id",
                    kind: "normal",
                    body: "请核对",
                    createdBy: CREATED_BY,
                    createdAt: "2026-08-10T00:00:00.000Z",
                    updatedAt: null,
                  },
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { id: "block_p_2" },
          content: [
            {
              type: "text",
              text: "第一段修订",
              marks: [
                {
                  type: "revision",
                  attrs: {
                    id: "same_business_id",
                    groupId: "revision_group_1",
                    kind: "delete",
                    role: "deleted",
                    createdBy: CREATED_BY,
                    createdAt: "2026-08-10T00:00:00.000Z",
                  },
                },
              ],
            },
          ],
        },
        {
          type: "paragraph",
          attrs: { id: "block_p_3" },
          content: [
            {
              type: "text",
              text: "第二段修订",
              marks: [
                {
                  type: "revision",
                  attrs: {
                    id: "revision_segment_2",
                    groupId: "revision_group_1",
                    kind: "delete",
                    role: "deleted",
                    createdBy: CREATED_BY,
                    createdAt: "2026-08-10T00:00:00.000Z",
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

function activeDecorationRanges(editor: Editor, activeKey: string) {
  // 直接调用插件使用的 decoration 生成函数，验证结果不依赖浏览器 DOM focus，
  // 同时覆盖来源隔离和跨段 revision 的 groupId 聚合规则。
  return getDiscussionHighlightDecorations(editor.state, activeKey)?.find().map((decoration) => ({
    from: decoration.from,
    to: decoration.to,
  })) ?? []
}

describe("历史版本批注定位", () => {
  it("非空选区会继续遍历段落子节点并识别对应批注", () => {
    const editor = createDiscussionEditor()

    // 选区落在第一个段落的批注文本内；旧逻辑会在 paragraph 父节点提前返回 false，始终得到 null。
    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, 3)))

    expect(getActiveKeyFromSelection(editor.state)).toBe("comment:same_business_id")
    editor.destroy()
  })

  it("只读模式无需 DOM focus，也能高亮同组的全部修订且不串到同 id 批注", () => {
    const editor = createDiscussionEditor()

    // 两段 revision 的 mark.id 不同，但 groupId 相同，应产生两段高亮；同 id 的 comment 不能被误高亮。
    expect(activeDecorationRanges(editor, "revision:revision_group_1")).toEqual([
      { from: 7, to: 12 },
      { from: 14, to: 19 },
    ])
    editor.destroy()
  })
})
