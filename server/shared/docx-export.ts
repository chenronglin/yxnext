import "server-only"

import { Document, HeadingLevel, Packer, Paragraph, ShadingType, TextRun } from "docx"

import { extractCleanNovelDocBlocks, isNovelTextNode, type NovelBlockNode, type NovelContentNode, type NovelDocJson, type NovelMarkJson } from "@/lib/novel-doc"

type DocxSectionInput = {
  title: string
  body?: string
  contentJson?: NovelDocJson | null
}

function textToParagraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((segment) => segment.trim())
    .filter(Boolean)
    .map(
      (segment) =>
        new Paragraph({
          children: [new TextRun(segment)],
          spacing: {
            after: 240,
          },
        }),
    )
}

function normalizeDocxColor(value: unknown) {
  if (typeof value !== "string") {
    return undefined
  }

  const color = value.trim().replace(/^#/, "")

  return /^[0-9a-fA-F]{6}$/.test(color) ? color.toUpperCase() : undefined
}

function textStyleColor(marks: NovelMarkJson[]) {
  for (const mark of marks) {
    if (mark.type !== "textStyle") {
      continue
    }

    const color = normalizeDocxColor(mark.attrs?.color)

    if (color) {
      return color
    }
  }

  return undefined
}

function textHighlightShading(marks: NovelMarkJson[]) {
  for (const mark of marks) {
    if (mark.type !== "highlight") {
      continue
    }

    const fill = normalizeDocxColor(mark.attrs?.color)

    if (fill) {
      return {
        type: ShadingType.CLEAR,
        fill,
      }
    }
  }

  return undefined
}

function textRunFromMarks(text: string, marks: NovelMarkJson[] | undefined) {
  const safeMarks = marks ?? []

  return new TextRun({
    text,
    bold: safeMarks.some((mark) => mark.type === "bold") || undefined,
    italics: safeMarks.some((mark) => mark.type === "italic") || undefined,
    underline: safeMarks.some((mark) => mark.type === "underline") ? {} : undefined,
    strike: safeMarks.some((mark) => mark.type === "strike") || undefined,
    color: textStyleColor(safeMarks),
    shading: textHighlightShading(safeMarks),
  })
}

function inlineContentToRuns(content: NovelContentNode[] | undefined): TextRun[] {
  const runs: TextRun[] = []

  for (const child of content ?? []) {
    if (isNovelTextNode(child)) {
      if (child.text) {
        runs.push(textRunFromMarks(child.text, child.marks))
      }
      continue
    }

    if (child.type === "hardBreak") {
      runs.push(new TextRun({ break: 1 }))
      continue
    }

    runs.push(...inlineContentToRuns(child.content))
  }

  return runs
}

function headingLevel(block: NovelBlockNode) {
  if (block.type !== "heading") {
    return undefined
  }

  if (block.attrs?.level === 1) return HeadingLevel.HEADING_1
  if (block.attrs?.level === 2) return HeadingLevel.HEADING_2
  if (block.attrs?.level === 3) return HeadingLevel.HEADING_3

  return HeadingLevel.HEADING_1
}

function blockToParagraph(block: NovelBlockNode) {
  return new Paragraph({
    children: inlineContentToRuns(block.content),
    heading: headingLevel(block),
    spacing: {
      after: 240,
    },
  })
}

function novelDocToParagraphs(doc: NovelDocJson) {
  // Word 导出优先使用编辑器 JSON，而不是 exportText 纯文本；这样可以保留作者原始分段、标题和基础文字格式。
  // extractCleanNovelDocBlocks 会去掉批注/修订协作语义，只留下适合交付的清稿正文块。
  return extractCleanNovelDocBlocks(doc).map(blockToParagraph)
}

export async function buildDocxBuffer(input: {
  title: string
  sections: DocxSectionInput[]
}) {
  const children: Paragraph[] = [
    new Paragraph({
      text: input.title,
      heading: HeadingLevel.TITLE,
      spacing: {
        after: 360,
      },
    }),
  ]

  for (const section of input.sections) {
    children.push(
      new Paragraph({
        text: section.title,
        heading: HeadingLevel.HEADING_1,
        spacing: {
          before: 240,
          after: 240,
        },
      }),
    )

    const richTextParagraphs = section.contentJson ? novelDocToParagraphs(section.contentJson) : []

    if (richTextParagraphs.length > 0) {
      children.push(...richTextParagraphs)
    } else if (section.body) {
      children.push(...textToParagraphs(section.body))
    }
  }

  const document = new Document({
    sections: [
      {
        properties: {},
        children,
      },
    ],
  })

  return Packer.toBuffer(document)
}
