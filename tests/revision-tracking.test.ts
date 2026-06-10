import { Schema, type Mark as ProseMirrorMark, type Node as ProseMirrorNode } from "@tiptap/pm/model"
import { EditorState } from "@tiptap/pm/state"
import { describe, expect, it } from "vitest"

import { resolveInsertedRevision } from "@/components/doc/tiptap/extensions"
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
