import type { BadgeTone, SiStatus } from "@/types/domain"

// 当前 UI 里主类型仍然是固定下拉项；即使数据库未预置，也按界面设计提供这些选项。
export const DEFAULT_MAIN_TYPES = [
  "都市言情",
  "古代言情",
  "玄幻奇幻",
  "悬疑推理",
  "科幻末世",
  "历史架空",
  "现实题材",
] as const

// SI 状态色彩与现有界面标签保持一致，避免后端状态接入后出现视觉语义漂移。
export const SI_STATUS_TONE: Record<SiStatus, BadgeTone> = {
  draft: "neutral",
  prereleased: "info",
  converted: "success",
  archived: "warning",
}

export type PrereleaseStatus = "active" | "withdrawn" | "converted"

// 预发状态只暴露稳定的字典 key；页面根据当前 locale 翻译展示，避免英文界面继续渲染中文状态。
export const PRERELEASE_STATUS_LABEL_KEYS: Record<PrereleaseStatus, string> = {
  active: "domain.prereleaseStatus.active",
  withdrawn: "domain.prereleaseStatus.withdrawn",
  converted: "domain.prereleaseStatus.converted",
}

export const PRERELEASE_STATUS_TONE: Record<PrereleaseStatus, BadgeTone> = {
  active: "info",
  withdrawn: "neutral",
  converted: "success",
}

export interface BoundAuthor {
  id: string
  name: string
}

// SI 版本历史只承载选题快照，不承载项目四阶段 Doc 的 Revision 语义。
export interface SiVersion {
  id: string
  version: number
  savedBy: string
  savedAt: string
  note?: string
  current: boolean
  title: string
  mainType: string
  trope: string
  freshTwist: string
  synopsis: string
}

export interface PrereleaseRecord {
  id: string
  recordId: string
  siId: string
  siTitle: string
  title: string
  mainType: string
  trope: string
  remark: string
  freshTwist: string
  synopsis: string
  authorId: string
  authorName: string
  editorId: string
  editorName: string
  note: string
  status: PrereleaseStatus
  prereleasedAt: string
  withdrawnAt?: string
  convertedAt?: string
  projectId?: string
  projectName?: string
  projectStage?: string
}

// SI 详情对象会同时给详情页、编辑页和预发弹窗使用，因此把预发记录和版本列表一起带上。
export interface SiItem {
  id: string
  title: string
  mainTypeId?: string
  mainType: string
  trope: string
  authors: string[]
  authorIds: string[]
  remark: string
  fitAuthorNote: string
  freshTwist: string
  synopsis: string
  status: SiStatus
  createdBy: string
  creatorEditorId: string
  createdAt: string
  updatedAt: string
  prereleaseCount: number
  converted: boolean
  currentVersionNo: number
  latestVersionId?: string
  preissues: PrereleaseRecord[]
  versions: SiVersion[]
}
