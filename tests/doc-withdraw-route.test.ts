import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const mocks = vi.hoisted(() => ({ actor: vi.fn(), withdraw: vi.fn(), state: vi.fn(), start: vi.fn() }))
vi.mock("@/server/shared/current-user", () => ({ requireApiCurrentUser: mocks.actor }))
vi.mock("@/server/modules/doc/doc.service", () => ({ withdrawDoc: mocks.withdraw, getDocWorkflowState: mocks.state, startDocReview: mocks.start }))

import { POST as startReview } from "@/app/api/docs/[docId]/start-review/route"
import { GET, POST } from "@/app/api/docs/[docId]/withdraw/route"
import { ApiError } from "@/server/shared/api-response"
import { docSaveSchema, docSubmitSchema, docReturnSchema, docApproveSchema } from "@/server/modules/doc/doc.schemas"

const actor = { userId: 200n, role: "author" }
const context = { params: Promise.resolve({ docId: "1" }) }
function request(body: unknown) {
  return new NextRequest("https://example.test/api/docs/1/withdraw", {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  })
}

beforeEach(() => {
  vi.resetAllMocks()
  mocks.actor.mockResolvedValue(actor)
})

describe("撤回接口", () => {
  it("身份验证后将草稿批次和版本传给服务", async () => {
    mocks.withdraw.mockResolvedValue({ doc: { status: "draft" } })
    const response = await POST(request({ draftId: "502", lockVersion: 0 }), context)
    expect(response.status).toBe(200)
    expect(mocks.withdraw).toHaveBeenCalledWith(actor, "1", { draftId: "502", lockVersion: 0 })
    expect(await response.json()).toMatchObject({ ok: true, doc: { status: "draft" } })
  })

  it.each([{}, { lockVersion: 0 }, { draftId: "502", lockVersion: -1 }, { draftId: "oops", lockVersion: 0 }])("拒绝缺失或无效的批次/版本：%j", async (body) => {
    expect((await POST(request(body), context)).status).toBe(400)
    expect(mocks.withdraw).not.toHaveBeenCalled()
  })

  it("未登录不能读取撤回状态或提交撤回", async () => {
    mocks.actor.mockRejectedValue(new ApiError({ status: 401, code: "UNAUTHORIZED", message: "请登录" }))
    expect((await GET(request({}), context)).status).toBe(401)
    expect((await POST(request({ draftId: "502", lockVersion: 0 }), context)).status).toBe(401)
    expect(mocks.state).not.toHaveBeenCalled()
    expect(mocks.withdraw).not.toHaveBeenCalled()
  })

  it("冲突向调用方返回 409 和具体原因", async () => {
    mocks.withdraw.mockRejectedValue(new ApiError({ status: 409, code: "DOC_WITHDRAW_REVIEW_STARTED", message: "编辑已开始审核" }))
    const response = await POST(request({ draftId: "502", lockVersion: 0 }), context)
    expect(response.status).toBe(409)
    expect(await response.json()).toMatchObject({ code: "DOC_WITHDRAW_REVIEW_STARTED" })
  })

  it("轻量状态响应不可缓存", async () => {
    mocks.state.mockResolvedValue({ activeDraftId: "502", withdrawal: { canWithdraw: true } })
    const response = await GET(request({}), context)
    expect(response.headers.get("Cache-Control")).toBe("no-store")
    expect(mocks.state).toHaveBeenCalledWith(actor, "1")
  })

  it.each([docSaveSchema, docSubmitSchema, docReturnSchema, docApproveSchema])("所有草稿写入接口都拒绝不携带草稿 ID 的旧客户端", (schema) => {
    const result = schema.safeParse({ lockVersion: 0, contentJson: {}, wordCount: 0, plainText: "", returnNote: "修改" })
    expect(result.success).toBe(false)
    if (!result.success) expect(result.error.issues.some((issue) => issue.path[0] === "draftId")).toBe(true)
  })
})


describe("开始审核接口", () => {
  it("传递身份和本轮草稿版本", async () => {
    const editor = { userId: 100n, role: "editor" }
    mocks.actor.mockResolvedValue(editor)
    mocks.start.mockResolvedValue({ permissions: { canApprove: true } })
    const response = await startReview(request({ draftId: "502", lockVersion: 0 }), context)
    expect(response.status).toBe(200)
    expect(mocks.start).toHaveBeenCalledWith(editor, "1", { draftId: "502", lockVersion: 0 })
  })

  it("缺少批次不能开始审核", async () => {
    expect((await startReview(request({ lockVersion: 0 }), context)).status).toBe(400)
    expect(mocks.start).not.toHaveBeenCalled()
  })

  it("未登录或非审核人不能开始审核", async () => {
    mocks.actor.mockRejectedValueOnce(new ApiError({ status: 401, code: "UNAUTHORIZED", message: "请登录" }))
    expect((await startReview(request({ draftId: "502", lockVersion: 0 }), context)).status).toBe(401)
    expect(mocks.start).not.toHaveBeenCalled()
    mocks.start.mockRejectedValueOnce(new ApiError({ status: 403, code: "DOC_REVIEW_FORBIDDEN", message: "无权审核" }))
    expect((await startReview(request({ draftId: "502", lockVersion: 0 }), context)).status).toBe(403)
  })
})
