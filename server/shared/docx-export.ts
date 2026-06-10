import "server-only"

import { Document, HeadingLevel, Packer, Paragraph, TextRun } from "docx"

type DocxSectionInput = {
  title: string
  body: string
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
    children.push(...textToParagraphs(section.body))
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
