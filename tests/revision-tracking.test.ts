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
  const segments: Array<{ text: string; id: string; kind: string; role: string }> = []

  doc.descendants((node) => {
    if (!node.isText || !node.text) {
      return true
    }

    node.marks.forEach((mark) => {
      if (mark.type.name === "revision") {
        segments.push({
          text: node.text ?? "",
          id: String(mark.attrs.id),
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
