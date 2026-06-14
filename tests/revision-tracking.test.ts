import { Schema, type Mark as ProseMirrorMark, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { EditorState, TextSelection, type Transaction } from "@tiptap/pm/state"
import type { EditorView } from "@tiptap/pm/view"
import { describe, expect, it } from "vitest"

import {
  applyInsertedText,
  findInsertedRevisionAtPosition,
  findInsertedRevisionCoveringRange,
  findMergeableInsertedRevision,
  makeOriginalRevisionAttrs,
  resolveInsertedRevision,
  markDeletedRange,
} from "@/components/doc/tiptap/extensions"
import type { NovelCreatedBy } from "@/lib/novel-doc"

const CREATED_BY: NovelCreatedBy = {
  userId: "editor-1",
  role: "editor",
  nameSnapshot: "编辑甲",
}

const schema = new Schema({
  nodes: {
    doc: { content: "block+" },
    paragraph: {
      content: "inline*",
      group: "block",
      parseDOM: [{ tag: "p" }],
      toDOM: () => ["p", 0],
    },
    text: { group: "inline" },
  },
  marks: {
    revision: {
      attrs: {
        id: { default: null },
        groupId: { default: null },
        kind: { default: null },
        role: { default: null },
        createdBy: { default: null },
        createdAt: { default: null },
      },
      parseDOM: [{ tag: "span[data-revision-id]" }],
      toDOM: (mark: ProseMirrorMark) => [
        "span",
        {
          "data-revision-id": mark.attrs.id,
          "data-revision-kind": mark.attrs.kind,
          "data-revision-role": mark.attrs.role,
        },
        0,
      ],
    },
  },
})

function makeRevisionMark(attrs: Record<string, unknown>) {
  return schema.marks.revision.create(attrs)
}

function makeState(doc: ProseMirrorNode) {
  return EditorState.create({ schema, doc })
}

function makeStateWithSelection(doc: ProseMirrorNode, from: number, to = from) {
  return EditorState.create({
    schema,
    doc,
    selection: TextSelection.create(doc, from, to),
  })
}

function dispatchInsertedText(state: EditorState, text: string, range: { from: number; to: number }) {
  let dispatched: Transaction | undefined
  const view = {
    state,
    dispatch: (tr: Transaction) => {
      dispatched = tr
    },
  } as unknown as EditorView

  const applied = applyInsertedText(view, text, range, { enabled: true, createdBy: CREATED_BY })

  expect(applied).toBe(true)

  if (!dispatched) {
    throw new Error("修订输入没有派发事务")
  }

  return dispatched.doc
}

function endOfFirstInserted(doc: ProseMirrorNode) {
  let end: number | null = null

  doc.descendants((node, pos) => {
    if (
      end == null &&
      node.isText &&
      node.marks.some((mark) => mark.type.name === "revision" && mark.attrs.role === "inserted")
    ) {
      end = pos + node.nodeSize
      return false
    }

    return true
  })

  return end
}

function rangeOfFirstInserted(doc: ProseMirrorNode): { from: number; to: number } | null {
  let range: { from: number; to: number } | null = null

  doc.descendants((node, pos) => {
    if (
      !range &&
      node.isText &&
      node.marks.some((mark) => mark.type.name === "revision" && mark.attrs.role === "inserted")
    ) {
      range = { from: pos, to: pos + node.nodeSize }
      return false
    }

    return true
  })

  return range
}

function collectRevisionText(doc: ProseMirrorNode) {
  const segments: Array<{ text: string; id: string; groupId: string; kind: string; role: string }> = []

  doc.descendants((node) => {
    if (!node.isText || !node.text) {
      return true
    }

    node.marks.forEach((mark) => {
      if (mark.type.name === "revision") {
        segments.push({
          text: node.text ?? "",
          id: String(mark.attrs.id),
          groupId: String(mark.attrs.groupId),
          kind: String(mark.attrs.kind),
          role: String(mark.attrs.role),
        })
      }
    })

    return true
  })

  return segments
}

describe("findMergeableInsertedRevision", () => {
  it("返回光标左侧紧邻 inserted 修订的完整 attrs", () => {
    const insertedAttrs = {
      id: "revision_replace_1",
      groupId: "revision_group_1",
      kind: "replace",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("原文"),
        schema.text("替换内容", [makeRevisionMark(insertedAttrs)]),
      ]),
    ])
    const pos = endOfFirstInserted(doc)

    expect(findMergeableInsertedRevision(makeState(doc), pos ?? 0)).toMatchObject(insertedAttrs)
  })

  it("左侧不是 inserted 修订时返回 null", () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text("普通正文")])])

    expect(findMergeableInsertedRevision(makeState(doc), 3)).toBeNull()
  })
})

describe("findInsertedRevisionCoveringRange", () => {
  it("光标在 inserted 修订开头时也能识别当前修订", () => {
    const insertedAttrs = {
      id: "revision_insert_1",
      groupId: "revision_group_1",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("新增", [makeRevisionMark(insertedAttrs)])]),
    ])
    const range = rangeOfFirstInserted(doc)

    if (!range) {
      throw new Error("测试文档缺少 inserted 修订")
    }

    expect(findInsertedRevisionAtPosition(makeState(doc), range.from)).toMatchObject(insertedAttrs)
  })

  it("选区完全落在同一 inserted 修订内时返回该修订 attrs", () => {
    const insertedAttrs = {
      id: "revision_replace_1",
      groupId: "revision_group_1",
      kind: "replace",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("替换内容", [makeRevisionMark(insertedAttrs)])]),
    ])
    const range = rangeOfFirstInserted(doc)

    if (!range) {
      throw new Error("测试文档缺少 inserted 修订")
    }

    expect(
      findInsertedRevisionCoveringRange(makeState(doc), {
        from: range.from + 1,
        to: range.from + 3,
      }),
    ).toMatchObject(insertedAttrs)
  })
})

describe("resolveInsertedRevision", () => {
  it("继续紧邻的替换修订时复用完整 inserted attrs", () => {
    const insertedAttrs = {
      id: "revision_replace_1",
      groupId: "revision_group_1",
      kind: "replace",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("原文"),
        schema.text("替换内容", [makeRevisionMark(insertedAttrs)]),
      ]),
    ])
    const pos = endOfFirstInserted(doc)

    expect(pos).toBeTypeOf("number")

    const result = resolveInsertedRevision(makeState(doc), pos ?? 0, { enabled: true, createdBy: CREATED_BY }, true, false)

    expect(result).toMatchObject(insertedAttrs)
  })

  it("禁止复用时创建新的 insert 修订", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("新增", [
          makeRevisionMark({
            id: "revision_insert_1",
            groupId: "revision_group_1",
            kind: "insert",
            role: "inserted",
            createdBy: CREATED_BY,
            createdAt: "2026-06-10T10:00:00.000Z",
          }),
        ]),
      ]),
    ])
    const pos = endOfFirstInserted(doc)
    const result = resolveInsertedRevision(makeState(doc), pos ?? 0, { enabled: true, createdBy: CREATED_BY }, false, false)

    expect(result.id).not.toBe("revision_insert_1")
    expect(result.kind).toBe("insert")
    expect(result.role).toBe("inserted")
  })

  it("没有邻接 inserted 修订时按替换输入创建 replace 修订", () => {
    const doc = schema.nodes.doc.create(null, [schema.nodes.paragraph.create(null, [schema.text("普通正文")])])
    const result = resolveInsertedRevision(makeState(doc), 3, { enabled: true, createdBy: CREATED_BY }, true, true)

    expect(result.kind).toBe("replace")
    expect(result.role).toBe("inserted")
  })
})

describe("applyInsertedText", () => {
  it("在新增修订内部继续输入时沿用同一个 revision id 和 kind", () => {
    const insertedAttrs = {
      id: "revision_insert_1",
      groupId: "revision_group_1",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("新增", [makeRevisionMark(insertedAttrs)])]),
    ])
    const range = rangeOfFirstInserted(doc)

    if (!range) {
      throw new Error("测试文档缺少 inserted 修订")
    }

    const nextDoc = dispatchInsertedText(makeStateWithSelection(doc, range.from + 1), "补", {
      from: range.from + 1,
      to: range.from + 1,
    })
    const revisions = collectRevisionText(nextDoc)

    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({
      text: "新补增",
      id: "revision_insert_1",
      kind: "insert",
      role: "inserted",
    })
  })

  it("替换修订的 inserted 文本被局部改写时不创建新修订和 original 段", () => {
    const insertedAttrs = {
      id: "revision_replace_1",
      groupId: "revision_group_1",
      kind: "replace",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("替换内容", [makeRevisionMark(insertedAttrs)])]),
    ])
    const range = rangeOfFirstInserted(doc)

    if (!range) {
      throw new Error("测试文档缺少 inserted 修订")
    }

    const nextDoc = dispatchInsertedText(makeStateWithSelection(doc, range.from + 1, range.from + 2), "改", {
      from: range.from + 1,
      to: range.from + 2,
    })
    const revisions = collectRevisionText(nextDoc)

    expect(revisions).toHaveLength(1)
    expect(revisions[0]).toMatchObject({
      text: "替改内容",
      id: "revision_replace_1",
      kind: "replace",
      role: "inserted",
    })
  })
})

describe("makeOriginalRevisionAttrs", () => {
  it("替换修订的 original 只切换 role，不生成新的 revision id", () => {
    const insertedAttrs = {
      id: "revision_replace_1",
      groupId: "revision_group_1",
      kind: "replace" as const,
      role: "inserted" as const,
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const originalAttrs = makeOriginalRevisionAttrs(insertedAttrs)

    expect(originalAttrs).toEqual({
      ...insertedAttrs,
      role: "original",
    })
  })
})

describe("markDeletedRange", () => {
  function dispatchDeletedRange(state: EditorState, range: { from: number; to: number }) {
    let dispatched: Transaction | undefined
    const view = {
      state,
      dispatch: (tr: Transaction) => {
        dispatched = tr
      },
    } as unknown as EditorView

    const applied = markDeletedRange(state, range, { enabled: true, createdBy: CREATED_BY }, view.dispatch)

    return { applied, doc: dispatched?.doc, tr: dispatched }
  }

  it("deleting inserted text directly removes it from document without delete mark", () => {
    const insertedAttrs = {
      id: "rev-1",
      groupId: "rev-group-1",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("原文"),
        schema.text("新增内容", [makeRevisionMark(insertedAttrs)]),
      ]),
    ])
    // The inserted text "新增内容" is from pos 3 to 7.
    // Let's delete a character "内" at pos 5 to 6.
    const state = makeState(doc)
    const result = dispatchDeletedRange(state, { from: 5, to: 6 })

    expect(result.applied).toBe(true)
    expect(result.doc).not.toBeUndefined()
    
    // Check document text
    expect(result.doc?.textContent).toBe("原文新增容")
    
    // Check revision marks - there should be no deleted mark, only the inserted mark on "新增容"
    const revs = collectRevisionText(result.doc!)
    expect(revs).toHaveLength(1)
    expect(revs[0]).toMatchObject({
      text: "新增容",
      id: "rev-1",
      kind: "insert",
      role: "inserted",
    })
  })

  it("deleting a mixed range containing both original and inserted text deletes inserted directly and marks original as deleted", () => {
    const insertedAttrs = {
      id: "rev-1",
      groupId: "rev-group-1",
      kind: "insert",
      role: "inserted",
      createdBy: CREATED_BY,
      createdAt: "2026-06-10T10:00:00.000Z",
    }
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [
        schema.text("原文"),
        schema.text("新增", [makeRevisionMark(insertedAttrs)]),
      ]),
    ])
    // Text: "原文新增", positions:
    // "原文" is 1 to 3.
    // "新增" is 3 to 5.
    // Let's delete from pos 2 to 4 (covers "文" and "新").
    const state = makeState(doc)
    const result = dispatchDeletedRange(state, { from: 2, to: 4 })

    expect(result.applied).toBe(true)
    expect(result.doc).not.toBeUndefined()

    // "新" (inserted) is deleted directly.
    // "文" (original) is marked as deleted.
    // Text remaining in document: "原文增", with "文" having deleted mark, and "增" having inserted mark.
    expect(result.doc?.textContent).toBe("原文增")

    const revs = collectRevisionText(result.doc!)
    // We expect 2 revision segments:
    // 1. "文" with deleted role.
    // 2. "增" with inserted role.
    expect(revs).toHaveLength(2)
    expect(revs).toContainEqual(expect.objectContaining({
      text: "文",
      role: "deleted",
    }))
    expect(revs).toContainEqual(expect.objectContaining({
      text: "增",
      role: "inserted",
      id: "rev-1",
    }))
  })

  it("跨段落删除会用同一个 groupId 聚合为一次修订操作", () => {
    const doc = schema.nodes.doc.create(null, [
      schema.nodes.paragraph.create(null, [schema.text("第一段")]),
      schema.nodes.paragraph.create(null, [schema.text("第二段")]),
    ])
    const state = makeState(doc)
    const textRanges: Array<{ from: number; to: number }> = []

    state.doc.descendants((node, pos) => {
      if (node.isText && node.text) {
        textRanges.push({ from: pos, to: pos + node.nodeSize })
      }

      return true
    })

    const result = dispatchDeletedRange(state, {
      from: textRanges[0].from,
      to: textRanges[textRanges.length - 1].to,
    })

    expect(result.applied).toBe(true)

    const revs = collectRevisionText(result.doc!)
    const deletedRevisions = revs.filter((item) => item.kind === "delete" && item.role === "deleted")

    expect(deletedRevisions).toHaveLength(2)
    expect(new Set(deletedRevisions.map((item) => item.groupId)).size).toBe(1)
    expect(new Set(deletedRevisions.map((item) => item.id)).size).toBe(2)
  })
})
