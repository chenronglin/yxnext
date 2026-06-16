import { describe, expect, it } from "vitest"

import {
  createNovelDocV1,
  createNovelParagraph,
  deriveNovelDocProjection,
  ensureNovelBlockIds,
  extractCleanNovelDocBlocks,
  isNovelDocV1,
  type NovelDocJson,
} from "@/lib/novel-doc"

const CREATED_BY = {
  userId: "100",
  role: "editor" as const,
  nameSnapshot: "编辑甲",
}

function makeDoc(content: NovelDocJson["content"]): NovelDocJson {
  return createNovelDocV1({
    docId: 1,
    docType: "chapter",
    title: "第一章",
    createdAt: "2026-06-09T10:00:00.000Z",
    updatedAt: "2026-06-09T10:00:00.000Z",
    content,
  })
}

describe("Novel Editor Tiptap JSON v1", () => {
  it("校验 V1 根结构，并拒绝旧的无 attrs 根结构", () => {
    const doc = makeDoc([])

    expect(isNovelDocV1(doc)).toBe(true)
    expect(isNovelDocV1({ type: "doc", content: [] })).toBe(false)
  })

  it("为缺少 id 的段落和标题补齐 block id", () => {
    const doc = makeDoc([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "标题" }] },
      { type: "paragraph", content: [{ type: "text", text: "正文" }] },
    ])
    const fixed = ensureNovelBlockIds(doc)

    expect(String(fixed.content[0].attrs?.id)).toMatch(/^block_h_/)
    expect(String(fixed.content[1].attrs?.id)).toMatch(/^block_p_/)
  })

  it("按清稿规则计算正文、字数和批注修订计数", () => {
    const doc = makeDoc([
      {
        type: "paragraph",
        attrs: { id: "block_p_1" },
        content: [
          {
            type: "text",
            text: "甲",
            marks: [
              {
                type: "comment",
                attrs: {
                  id: "comment_1",
                  kind: "normal",
                  body: "保留",
                  createdBy: CREATED_BY,
                  createdAt: "2026-06-09T10:00:00.000Z",
                  updatedAt: null,
                },
              },
            ],
          },
          {
            type: "text",
            text: "删",
            marks: [
              {
                type: "revision",
                attrs: {
                  id: "revision_deleted",
                  groupId: "revision_group_1",
                  kind: "delete",
                  role: "deleted",
                  createdBy: CREATED_BY,
                  createdAt: "2026-06-09T10:00:00.000Z",
                },
              },
            ],
          },
          {
            type: "text",
            text: "新",
            marks: [
              {
                type: "revision",
                attrs: {
                  id: "revision_inserted",
                  groupId: "revision_group_2",
                  kind: "replace",
                  role: "inserted",
                  createdBy: CREATED_BY,
                  createdAt: "2026-06-09T10:00:00.000Z",
                },
              },
            ],
          },
          {
            type: "text",
            text: "旧",
            marks: [
              {
                type: "revision",
                attrs: {
                  id: "revision_original",
                  groupId: "revision_group_2",
                  kind: "replace",
                  role: "original",
                  createdBy: CREATED_BY,
                  createdAt: "2026-06-09T10:00:00.000Z",
                },
              },
            ],
          },
        ],
      },
      {
        type: "editSuggestion",
        attrs: {
          id: "suggestion_1",
          anchorBlockId: "block_p_1",
          position: "after",
          category: "rhythm",
          body: "节奏建议",
          createdBy: CREATED_BY,
          createdAt: "2026-06-09T10:00:00.000Z",
          updatedAt: null,
        },
      },
      createNovelParagraph({ id: "block_p_2", text: "乙" }),
    ])
    const projection = deriveNovelDocProjection(doc)

    expect(projection.plainText).toBe("甲删新旧\n\n乙")
    expect(projection.cleanText).toBe("甲新\n\n乙")
    expect(projection.wordCount).toBe(3)
    expect(projection.commentCount).toBe(1)
    expect(projection.suggestionCount).toBe(1)
    expect(projection.revisionMarkCount).toBe(3)
  })

  it("导出清稿块时保留作者分段和普通格式，同时移除协作标记", () => {
    const doc = makeDoc([
      {
        type: "heading",
        attrs: { id: "block_h_1", level: 2 },
        content: [{ type: "text", text: "章节小标题", marks: [{ type: "bold" }] }],
      },
      {
        type: "paragraph",
        attrs: { id: "block_p_1" },
        content: [
          {
            type: "text",
            text: "保留蓝色文字",
            marks: [
              { type: "comment", attrs: { id: "comment_1", body: "不进入导出" } },
              { type: "textStyle", attrs: { color: "#2563eb" } },
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
            text: "删除内容",
            marks: [{ type: "revision", attrs: { id: "revision_1", role: "deleted", kind: "delete" } }],
          },
          {
            type: "text",
            text: "新增内容",
            marks: [{ type: "revision", attrs: { id: "revision_2", role: "inserted", kind: "insert" } }],
          },
        ],
      },
      {
        type: "editSuggestion",
        attrs: {
          id: "suggestion_1",
          body: "编辑建议不进入终稿导出",
        },
      },
    ])

    const blocks = extractCleanNovelDocBlocks(doc)

    expect(blocks).toHaveLength(3)
    expect(blocks[0]).toMatchObject({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: "章节小标题", marks: [{ type: "bold" }] }],
    })
    expect(blocks[1]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "保留蓝色文字", marks: [{ type: "textStyle", attrs: { color: "#2563eb" } }] }],
    })
    expect(blocks[2]).toMatchObject({
      type: "paragraph",
      content: [{ type: "text", text: "新增内容" }],
    })
  })
})
