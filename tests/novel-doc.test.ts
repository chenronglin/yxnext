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

  it("为缺少、空白或类型错误的段落和标题 id 补齐 block id", () => {
    const doc = makeDoc([
      { type: "heading", attrs: { level: 1 }, content: [{ type: "text", text: "标题" }] },
      { type: "paragraph", attrs: { id: "" }, content: [{ type: "text", text: "正文一" }] },
      { type: "paragraph", attrs: { id: "   " }, content: [{ type: "text", text: "正文二" }] },
      { type: "heading", attrs: { id: 42, level: 2 }, content: [{ type: "text", text: "小标题" }] },
    ])
    const fixed = ensureNovelBlockIds(doc)
    const fixedIds = fixed.content.map((block) => String(block.attrs?.id))

    expect(fixedIds[0]).toMatch(/^block_h_/)
    expect(fixedIds[1]).toMatch(/^block_p_/)
    expect(fixedIds[2]).toMatch(/^block_p_/)
    expect(fixedIds[3]).toMatch(/^block_h_/)
    expect(new Set(fixedIds).size).toBe(fixedIds.length)
  })

  it("修复重复 block id，并保持所有已唯一的合法 id 不变", () => {
    const doc = makeDoc([
      { type: "paragraph", attrs: { id: "block_p_unique" }, content: [{ type: "text", text: "唯一段落" }] },
      { type: "heading", attrs: { id: "block_shared", level: 1 }, content: [{ type: "text", text: "首次出现" }] },
      { type: "paragraph", attrs: { id: "block_shared" }, content: [{ type: "text", text: "重复段落" }] },
      { type: "heading", attrs: { id: "custom-heading-id", level: 2 }, content: [{ type: "text", text: "唯一标题" }] },
      {
        type: "editSuggestion",
        attrs: { id: "block_shared", anchorBlockId: "block_p_unique", body: "其它业务节点不参与正文 id 去重" },
      },
    ])
    const fixed = ensureNovelBlockIds(doc)
    const textBlockIds = fixed.content
      .filter((block) => block.type === "paragraph" || block.type === "heading")
      .map((block) => String(block.attrs?.id))

    // 唯一合法 id 与重复 id 的第一次出现者都必须保持原值，避免破坏既有锚点引用。
    expect(fixed.content[0].attrs?.id).toBe("block_p_unique")
    expect(fixed.content[1].attrs?.id).toBe("block_shared")
    expect(fixed.content[3].attrs?.id).toBe("custom-heading-id")

    // 后续重复项按自身块类型生成新 id，并且规范化后的正文 id 全局唯一。
    expect(String(fixed.content[2].attrs?.id)).toMatch(/^block_p_/)
    expect(fixed.content[2].attrs?.id).not.toBe("block_shared")
    expect(new Set(textBlockIds).size).toBe(textBlockIds.length)

    // 编辑建议使用独立业务 id 命名空间，不能因正文 block id 去重而被改写。
    expect(fixed.content[4].attrs?.id).toBe("block_shared")

    // 首次规范化已经得到合法且唯一的正文 id；再次规范化必须完全幂等，不能反复生成新锚点。
    expect(ensureNovelBlockIds(fixed)).toEqual(fixed)
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
