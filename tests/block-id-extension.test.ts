import StarterKit from "@tiptap/starter-kit"
import { Editor } from "@tiptap/core"
import { Fragment, Schema, Slice } from "@tiptap/pm/model"
import { EditorState, TextSelection } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"

import {
  BlockId,
  NovelDocument,
  NovelHeading,
  NovelParagraph,
  RevisionMark,
  applyInsertedSlice,
  normalizeNovelBlockIdsInState,
} from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

// 使用最小 ProseMirror schema 直接验证 BlockId 事务，不依赖 Tiptap DOM 挂载。
// 这样测试关注的就是 node attrs、selection mapping 与 history meta 三个稳定性不变量。
const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      attrs: { id: { default: null } },
      content: "text*",
      group: "block",
    },
    heading: {
      attrs: { id: { default: null }, level: { default: 1 } },
      content: "text*",
      group: "block",
    },
    text: {},
  },
})

const CREATED_BY: NovelCreatedBy = { userId: "e1", role: "editor", nameSnapshot: "编辑甲" }

function paragraph(text: string, id: string | null) {
  return schema.nodes.paragraph.create({ id }, text ? schema.text(text) : undefined)
}

function heading(text: string, id: string | null) {
  return schema.nodes.heading.create({ id, level: 1 }, text ? schema.text(text) : undefined)
}

describe("BlockId 结构不变量", () => {
  it("已存在唯一 id 时不生成额外 transaction", () => {
    const doc = schema.nodes.doc.create(null, [paragraph("第一段", "block_p_1"), heading("标题", "block_h_1")])
    const state = EditorState.create({ schema, doc })

    expect(normalizeNovelBlockIdsInState(state)).toBeNull()
  })

  it("同时修复缺失与重复 id，并保持当前 selection 不变", () => {
    const first = paragraph("第一段", "block_shared")
    const doc = schema.nodes.doc.create(null, [
      first,
      paragraph("第二段", "block_shared"),
      heading("第三段", null),
    ])
    const selectionPos = first.nodeSize + 2
    const state = EditorState.create({
      schema,
      doc,
      selection: TextSelection.create(doc, selectionPos),
    })
    const tr = normalizeNovelBlockIdsInState(state)

    expect(tr).not.toBeNull()
    expect(tr?.selection.from).toBe(selectionPos)
    expect(tr?.getMeta("addToHistory")).toBe(false)

    const nextState = state.apply(tr!)
    const ids: string[] = []
    nextState.doc.forEach((node) => ids.push(String(node.attrs.id)))

    expect(ids[0]).toBe("block_shared")
    expect(ids[1]).toMatch(/^block_p_/)
    expect(ids[2]).toMatch(/^block_h_/)
    expect(new Set(ids).size).toBe(ids.length)
    expect(nextState.selection.from).toBe(selectionPos)
  })

  it("复制已有 B 块并粘贴到原 B 之前时只给副本新 id，原块继续保留 B", () => {
    const editor = new Editor({
      extensions: [
        NovelDocument,
        NovelParagraph,
        NovelHeading.configure({ levels: [1, 2, 3] }),
        StarterKit.configure({ document: false, paragraph: false, heading: false }),
        BlockId,
        RevisionMark.configure({ enabled: true, createdBy: CREATED_BY }),
      ],
      content: {
        type: "doc",
        content: [
          { type: "paragraph", attrs: { id: "block_a" }, content: [{ type: "text", text: "A" }] },
          { type: "paragraph", attrs: { id: "block_b" }, content: [{ type: "text", text: "B" }] },
        ],
      },
    })
    const copiedOriginalB = editor.state.doc.child(1)
    const copiedSlice = new Slice(Fragment.from(copiedOriginalB), 0, 0)
    const beforeOriginalB = editor.state.doc.child(0).nodeSize

    // 内部复制得到的 Slice 会携带原块 block_b。粘贴入口必须先把副本 id 清空，
    // 再由 BlockId 插件只给新增块生成 id；否则按新文档顺序去重会错误保留副本、改写真正原块，
    // 使已有 anchorBlockId=block_b 的编辑建议跳到副本上。
    const applied = applyInsertedSlice(
      editor.view,
      copiedSlice,
      { from: beforeOriginalB, to: beforeOriginalB },
      { enabled: true, createdBy: CREATED_BY },
    )

    expect(applied).toBe(true)
    expect(editor.state.doc.childCount).toBe(3)

    // Headless Tiptap Editor 未挂载 DOM 时不会安装 addProseMirrorPlugins 返回的 View 插件，
    // 因此测试中显式执行与 BlockId.appendTransaction 完全相同的规范化函数，覆盖“粘贴事务 → ID 规范化”整条数据链。
    const normalization = normalizeNovelBlockIdsInState(editor.state)

    expect(normalization).not.toBeNull()
    editor.view.dispatch(normalization!)

    const ids: string[] = []
    const texts: string[] = []
    editor.state.doc.forEach((node) => {
      ids.push(String(node.attrs.id))
      texts.push(node.textContent)
    })

    expect(texts).toEqual(["A", "B", "B"])
    expect(ids[0]).toBe("block_a")
    expect(ids[1]).toMatch(/^block_p_/)
    expect(ids[1]).not.toBe("block_b")
    expect(ids[2]).toBe("block_b")
    expect(new Set(ids).size).toBe(ids.length)
    editor.destroy()
  })
})
