import { Editor } from "@tiptap/core"
import { TextSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"

import { createNovelEditorExtensions } from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

const CREATED_BY: NovelCreatedBy = {
  userId: "editor-1",
  role: "editor",
  nameSnapshot: "编辑甲",
}

function createEditor(content?: ReturnType<Editor["getJSON"]>) {
  return new Editor({
    extensions: createNovelEditorExtensions({
      trackChanges: true,
      createdBy: CREATED_BY,
    }),
    content: content ?? {
      type: "doc",
      attrs: {
        schemaVersion: 1,
        docId: "doc_text_align_test",
        docType: "chapter",
        title: "居中测试",
        createdAt: "2026-08-06T00:00:00.000Z",
        updatedAt: "2026-08-06T00:00:00.000Z",
      },
      content: [
        {
          type: "paragraph",
          attrs: { id: "block_p_1" },
          content: [{ type: "text", text: "需要居中的正文" }],
        },
        {
          type: "heading",
          attrs: { id: "block_h_1", level: 2 },
          content: [{ type: "text", text: "需要居中的标题" }],
        },
      ],
    },
  })
}

describe("编辑器居中排版", () => {
  it("可同时居中段落与标题，并在 JSON 保存和重新加载后保留", () => {
    const editor = createEditor()
    const documentEnd = editor.state.doc.content.size

    // 跨块选区覆盖正文和标题，验证工具栏的一次居中操作会更新所有受支持的文本块。
    editor.view.dispatch(
      editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 1, documentEnd - 1)),
    )
    // Headless Editor 没有可聚焦的 DOM，因此测试直接调用命令；浏览器工具栏会在同一命令前正常执行 focus。
    expect(editor.commands.setTextAlign("center")).toBe(true)

    const savedJson = editor.getJSON()
    const paragraphDomSpec = editor.schema.nodes.paragraph.spec.toDOM?.(editor.state.doc.child(0))

    expect(savedJson.content?.[0].attrs?.textAlign).toBe("center")
    expect(savedJson.content?.[1].attrs?.textAlign).toBe("center")
    expect(Array.isArray(paragraphDomSpec)).toBe(true)

    if (!Array.isArray(paragraphDomSpec)) {
      throw new Error("居中段落缺少可序列化的 DOM 结构")
    }

    expect(paragraphDomSpec[1]).toMatchObject({ style: "text-align: center" })
    editor.destroy()

    // 用保存后的 JSON 创建新编辑器，模拟自动保存后刷新页面或打开历史版本。
    const reloadedEditor = createEditor(savedJson)

    expect(reloadedEditor.getJSON().content?.[0].attrs?.textAlign).toBe("center")
    expect(reloadedEditor.getJSON().content?.[1].attrs?.textAlign).toBe("center")
    reloadedEditor.destroy()
  })

  it("再次点击居中会恢复默认左对齐，并把持久化属性重置为空", () => {
    const editor = createEditor()

    editor.view.dispatch(editor.state.tr.setSelection(TextSelection.create(editor.state.doc, 2)))
    editor.commands.setTextAlign("center")
    expect(editor.isActive({ textAlign: "center" })).toBe(true)

    editor.commands.toggleTextAlign("center")

    expect(editor.isActive({ textAlign: "center" })).toBe(false)
    expect(editor.getJSON().content?.[0].attrs?.textAlign).toBeNull()
    editor.destroy()
  })
})
