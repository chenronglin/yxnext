import { z } from "zod"

// Doc 内容真相源固定是完整文档 JSON 根对象；后端不解析节点，只做结构级兜底。
function isJsonRootObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

// 保存草稿需要完整内容投影与乐观锁版本号，计数字段先由前端或调用方直接给出。
export const docSaveSchema = z.object({
  lockVersion: z.number().int().min(0),
  contentJson: z.custom<Record<string, unknown>>(isJsonRootObject, {
    message: "contentJson 必须是 JSON 对象",
  }),
  wordCount: z.number().int().min(0),
  plainText: z.string(),
  cleanText: z.string().optional().nullable(),
  exportText: z.string().optional().nullable(),
  summary: z.string().optional().nullable(),
  contentSchemaVersion: z.number().int().min(1).optional(),
  commentCount: z.number().int().min(0).optional(),
  suggestionCount: z.number().int().min(0).optional(),
  revisionMarkCount: z.number().int().min(0).optional(),
})

// 提交审核只需要乐观锁版本和可选提交说明。
export const docSubmitSchema = z.object({
  lockVersion: z.number().int().min(0),
  submitNote: z.string().optional().nullable(),
})

// 退回说明在业务上必填，但仍交给 service 做 trim 后的最终断言，保证错误码稳定。
export const docReturnSchema = z.object({
  lockVersion: z.number().int().min(0),
  returnNote: z.string(),
})

// 审核通过允许附加说明，后端统一写入 last_handoff_note 与 Revision.handoff_note。
export const docApproveSchema = z.object({
  lockVersion: z.number().int().min(0),
  approveNote: z.string().optional().nullable(),
})

export type DocSaveSchemaInput = z.infer<typeof docSaveSchema>
export type DocSubmitSchemaInput = z.infer<typeof docSubmitSchema>
export type DocReturnSchemaInput = z.infer<typeof docReturnSchema>
export type DocApproveSchemaInput = z.infer<typeof docApproveSchema>
