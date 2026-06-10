import type { ApiDocStatus, DocContentSnapshot } from "@/types/doc"

export function docTypeLabel(docType: "synopsis" | "outline" | "chapter" | "release") {
  if (docType === "synopsis") return "梗概"
  if (docType === "outline") return "细纲"
  if (docType === "chapter") return "正文"
  return "质检"
}

export function docStatusTone(status: ApiDocStatus): "neutral" | "info" | "warning" | "success" {
  if (status === "submitted") return "info"
  if (status === "returned") return "warning"
  if (status === "approved") return "success"
  return "neutral"
}

export function holderTone(holderRole: "author" | "editor" | "none"): "info" | "warning" | "neutral" {
  if (holderRole === "author") return "info"
  if (holderRole === "editor") return "warning"
  return "neutral"
}

export function textToDocJson(text: string) {
  // 当前前端先以“轻量文本版编辑器”接通真实 API：
  // 每个空行切成一个段落，既满足后端对完整 content_json 的要求，
  // 也能让后续富文本编辑器替换时继续沿用同一接口。
  return {
    type: "doc",
    content: text
      .split(/\n{2,}/)
      .map((segment) => segment.trim())
      .filter(Boolean)
      .map((segment) => ({
        type: "paragraph",
        content: [{ type: "text", text: segment }],
      })),
  } as Record<string, unknown>
}

export function countChineseStyleWords(text: string) {
  return text.replace(/\s/g, "").length
}

export function snapshotText(snapshot: Pick<DocContentSnapshot, "plainText" | "cleanText" | "exportText">) {
  return snapshot.plainText ?? snapshot.cleanText ?? snapshot.exportText ?? ""
}
