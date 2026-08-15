export type OpenContentStage = "synopsis" | "outline" | "chapter"

export interface OpenContentItem {
  docId: string
  projectId: string
  stage: OpenContentStage
  title: string
  order: number | null
  wordCount: number
  updatedAt: string
  content: string
}

export interface OpenContentOrderRange {
  start: number
  end: number
}

// 内容 Token 可以不限制项目；配置白名单后，allowedProjectIds 保存允许读取的项目 ID 字符串集合。
export interface OpenContentPrincipal {
  caller: string
  allowedProjectIds: ReadonlySet<string> | null
}

// 每次正文调用都保存最小必要的请求上下文，用于回答“谁、何时、从哪里读取了哪些 Doc”。
export interface OpenContentAuditContext {
  caller: string
  requestId: string
  ipAddress: string | null
  userAgent: string | null
}

export interface OpenProjectContentInput {
  projectId: bigint
  stage: OpenContentStage
  orderRange: OpenContentOrderRange | null
  page: number
  pageSize: number | null
  principal: OpenContentPrincipal
  audit: OpenContentAuditContext
}

export interface OpenProjectContentResult {
  items: OpenContentItem[]
  page: number
  pageSize: number
  total: number
  totalPages: number
}
