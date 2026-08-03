import type { DocStatus, HolderRole, ProjectLifecycle, ProjectStage, StagePlanStatus } from "@/types/domain"

// Open API 使用独立类型固定对外契约，不直接继承后台页面类型。
// 这样后台页面以后增加或调整展示字段时，不会无意间改变 Agent 已经依赖的响应结构。
export interface OpenProjectStagePlan {
  stage: Exclude<ProjectStage, "completed">
  planDays: number
  startAt: string | null
  dueAt: string | null
  finishedAt: string | null
  status: StagePlanStatus
  timingNote: string
}

// 章节明细沿用当前管理员项目接口的字段名和状态语义。
// chapters 本身在项目对象上是可选字段，但一旦返回，每个章节对象都必须包含以下完整字段。
export interface OpenProjectChapter {
  id: string
  order: number
  title: string
  status: DocStatus
  holder: HolderRole
  words: number
  lastNote: string
  lastOperator: string
  lastOperatedAt: string
  approved: boolean
}

// 对外项目对象只暴露 Agent 看板需要的稳定字段，不携带后台筛选选项、审计日志或用户联系方式。
export interface OpenProjectItem {
  id: string
  title: string
  author: string
  authorId: string
  editor: string
  editorId: string
  mainType: string | null
  stage: ProjectStage
  lifecycle: ProjectLifecycle
  createdAt: string
  updatedAt: string
  syncUpdatedAt: string
  totalChapters: number
  approvedChapters: number
  stagePlans: OpenProjectStagePlan[]
  chapters?: OpenProjectChapter[]
}

// 查询服务接收已经由 Route 层校验完成的强类型参数，避免数据库层再次解释原始字符串。
export interface OpenProjectListInput {
  page: number
  pageSize: number
  updatedSince: Date | null
  includeChapters: boolean
}

// 响应继续沿用当前系统的分页字段名称；ok 外壳由统一的 API 响应工具在 Route 层补充。
export interface OpenProjectListResult {
  items: OpenProjectItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
