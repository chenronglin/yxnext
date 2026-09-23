import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import { Prisma, PrismaClient } from "@prisma/client"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { createConnection } from "mariadb"
import { createNovelDocV1, createNovelParagraph } from "@/lib/novel-doc"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { DocCurrentView } from "@/types/doc"

// 必须显式指定独立的本机测试库；普通 npm test 跳过这些用例，绝不沿用项目 DATABASE_URL。
const testUrl = process.env.DOC_WITHDRAW_TEST_DATABASE_URL
let db: PrismaClient
let service: typeof import("@/server/modules/doc/doc.service")
let author: ApiCurrentUser
let editor: ApiCurrentUser
let projectId: bigint

function draftInput(view: DocCurrentView) {
  if (view.source.kind !== "draft") throw new Error("预期存在活动草稿")
  return { draftId: view.source.draftId, lockVersion: view.source.lockVersion }
}

describe.skipIf(!testUrl)("撤回：真实 MySQL 事务", () => {
  beforeAll(async () => {
    const url = new URL(testUrl!)
    if (!["127.0.0.1", "localhost"].includes(url.hostname) || !url.pathname.startsWith("/doc_withdraw_test")) {
      throw new Error("仅允许本机 doc_withdraw_test 独立测试库")
    }
    db = new PrismaClient({ adapter: new PrismaMariaDb(testUrl!) })
    vi.doMock("@/server/db/prisma", () => ({ prisma: db }))
    service = await import("@/server/modules/doc/doc.service")
    const unique = Date.now().toString()
    async function user(role: "author" | "editor"): Promise<ApiCurrentUser> {
      const row = await db.user.create({ data: {
        username: `withdraw_${role}_${unique}`, email: `${role}_${unique}@example.test`,
        passwordHash: "integration-test-only", role, status: "active",
      } })
      return { id: row.userId.toString(), userId: row.userId, username: row.username, name: role, email: row.email, role, status: "active", preferredLocale: "zh-CN" }
    }
    author = await user("author")
    editor = await user("editor")
    const si = await db.storyIdea.create({ data: { title: "撤回测试", creatorEditorId: editor.userId } })
    const preissue = await db.siPreissue.create({ data: { siId: si.siId, editorId: editor.userId, authorId: author.userId, siSnapshotJson: {} } })
    const project = await db.project.create({ data: {
      sourceSiId: si.siId, siPreissueId: preissue.preissueId, title: "撤回事务测试",
      editorId: editor.userId, authorId: author.userId, createdBy: editor.userId, currentStage: "chapter",
      stagePlans: { create: { stageCode: "chapter", planDays: 7, gateStatus: "unlocked", timelineStatus: "in_progress" } },
    } })
    projectId = project.projectId
  })

  afterAll(async () => { await db?.$disconnect() })

  async function submitted() {
    const doc = await db.doc.create({ data: { projectId, docType: "chapter", stageCode: "chapter", title: "测试章节" } })
    const content = createNovelDocV1({ docId: doc.docId, docType: "chapter", title: "测试章节", content: [createNovelParagraph({ text: "保留原文及批注" })] })
    const draft = await db.docCurrentDraft.create({ data: {
      docId: doc.docId, ownerRole: "author", ownerUserId: author.userId, contentJson: content as unknown as Prisma.InputJsonObject,
      activeDocKey: doc.docId, wordCount: 8, plainText: "保留原文及批注",
    } })
    await db.doc.update({ where: { docId: doc.docId }, data: { activeDraftId: draft.draftId } })
    return service.submitDoc(author, doc.docId.toString(), { draftId: draft.draftId.toString(), lockVersion: 0 })
  }

  it("提交→撤回→修改→重新提交，正文与历史完整，旧编辑请求不能影响新一轮", async () => {
    const first = await submitted()
    const withdrawn = await service.withdrawDoc(author, first.doc.docId, draftInput(first))
    expect(withdrawn.permissions.canSave).toBe(true)
    expect(withdrawn.doc).toMatchObject({ status: "draft", holderRole: "author", lastAction: "author_withdraw" })
    expect(withdrawn.source.contentJson).toEqual(first.source.contentJson)
    expect(await db.todoItem.count({ where: { docId: BigInt(first.doc.docId), status: "open" } })).toBe(0)
    const saved = await service.saveDocDraft(author, first.doc.docId, {
      ...draftInput(withdrawn), wordCount: 0, plainText: "",
      contentJson: createNovelDocV1({ docId: first.doc.docId, docType: "chapter", title: "测试章节", content: [createNovelParagraph({ text: "作者补充的内容" })] }) as unknown as Record<string, unknown>,
    })
    const second = await service.submitDoc(author, first.doc.docId, draftInput(saved))
    expect(second.withdrawal.canWithdraw).toBe(true)
    expect(second.doc.activeDraftId).not.toBe(first.doc.activeDraftId)
    await expect(service.approveDoc(editor, first.doc.docId, draftInput(first))).rejects.toMatchObject({ code: "DOC_DRAFT_CHANGED" })
    const revisions = await db.docRevision.findMany({ where: { docId: BigInt(first.doc.docId) }, orderBy: { revisionNo: "asc" } })
    expect(revisions.map((r) => r.action)).toEqual(["author_submit", "author_withdraw", "author_submit"])
    expect(await db.todoItem.count({ where: { docId: BigInt(first.doc.docId), status: "open" } })).toBe(1)
  })

  it.each(["start", "save", "approve", "return", "withdraw"] as const)("撤回与 %s 并发时只有一方成功，草稿唯一且状态一致", async (otherAction) => {
    const view = await submitted()
    const input = draftInput(view)
    const id = view.doc.docId
    const other = () => otherAction === "start" ? service.startDocReview(editor, id, input) : otherAction === "save"
      ? service.saveDocDraft(editor, id, { ...input, contentJson: view.source.contentJson, plainText: "", wordCount: 0 })
      : otherAction === "approve" ? service.approveDoc(editor, id, input)
        : otherAction === "return" ? service.returnDocToAuthor(editor, id, { ...input, returnNote: "请修改" })
          : service.withdrawDoc(author, id, input)
    const results = await Promise.allSettled([service.withdrawDoc(author, id, input), other()])
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1)
    const current = await service.getCurrentDocView(author, id)
    const drafts = await db.docCurrentDraft.findMany({ where: { docId: BigInt(id), status: "active" } })
    expect(drafts).toHaveLength(current.doc.status === "approved" ? 0 : 1)
    if (drafts[0]) {
      expect(drafts[0].draftId.toString()).toBe(current.doc.activeDraftId)
      expect(drafts[0].ownerRole).toBe(current.doc.holderRole)
    }
    const openTodos = await db.todoItem.count({ where: { docId: BigInt(id), status: "open", todoType: "doc_review" } })
    expect(openTodos).toBe(current.doc.status === "submitted" ? 1 : 0)
    const events = await db.docRevision.findMany({ where: { docId: BigInt(id) } })
    expect(events.filter((r) => r.action !== "author_submit")).toHaveLength(current.doc.status === "submitted" ? 0 : 1)
  })

  it("编辑先保存后，即使作者重新读取最新版本也不能撤回", async () => {
    const view = await submitted()
    const started = await service.startDocReview(editor, view.doc.docId, draftInput(view))
    await service.saveDocDraft(editor, view.doc.docId, { ...draftInput(started), contentJson: view.source.contentJson, plainText: "", wordCount: 0 })
    const current = await service.getCurrentDocView(author, view.doc.docId)
    expect(current.withdrawal).toMatchObject({ canWithdraw: false, blockedReason: "review_started" })
    await expect(service.withdrawDoc(author, view.doc.docId, draftInput(current))).rejects.toMatchObject({ code: "DOC_WITHDRAW_REVIEW_STARTED" })
  })

  it("不受时间和次数限制：五轮撤回重提后仍可撤回", async () => {
    let view = await submitted()
    for (let round = 0; round < 5; round += 1) {
      await db.doc.update({ where: { docId: BigInt(view.doc.docId) }, data: { submittedAt: new Date("2020-01-01T00:00:00Z") } })
      const editorView = await service.getCurrentDocView(editor, view.doc.docId)
      expect(editorView.permissions).toMatchObject({ canStartReview: true, canSave: false, canApprove: false, canReturn: false })
      expect((await service.getCurrentDocView(author, view.doc.docId)).withdrawal.canWithdraw).toBe(true)
      const withdrawn = await service.withdrawDoc(author, view.doc.docId, draftInput(view))
      view = await service.submitDoc(author, view.doc.docId, draftInput(withdrawn))
    }
    expect(view.withdrawal.canWithdraw).toBe(true)
    expect(await db.docRevision.count({ where: { docId: BigInt(view.doc.docId), action: "author_withdraw" } })).toBe(5)
  })

  it("未开始审核不能绕过按钮保存/通过/退回；开始后立即禁止作者撤回", async () => {
    const view = await submitted()
    const id = view.doc.docId
    const input = draftInput(view)
    await expect(service.saveDocDraft(editor, id, { ...input, contentJson: view.source.contentJson, wordCount: 0, plainText: "" })).rejects.toMatchObject({ code: "DOC_REVIEW_NOT_STARTED" })
    await expect(service.approveDoc(editor, id, input)).rejects.toMatchObject({ code: "DOC_REVIEW_NOT_STARTED" })
    await expect(service.returnDocToAuthor(editor, id, { ...input, returnNote: "修改" })).rejects.toMatchObject({ code: "DOC_REVIEW_NOT_STARTED" })
    const started = await service.startDocReview(editor, id, input)
    expect(started.permissions).toMatchObject({ canStartReview: false, canSave: true, canReturn: true, canApprove: true })
    if (started.source.kind !== "draft") throw new Error("预期活动草稿")
    expect(started.source.saveCount).toBe(0)
    expect(started.source.reviewStartedAt).not.toBeNull()
    await expect(service.withdrawDoc(author, id, draftInput(started))).rejects.toMatchObject({ code: "DOC_WITHDRAW_REVIEW_STARTED" })
    // 同轮重复请求幂等，不生成重复开始记录。
    await service.startDocReview(editor, id, input)
    expect(await db.operationLog.count({ where: { docId: BigInt(id), action: "doc.start_review" } })).toBe(1)
    const returned = await service.returnDocToAuthor(editor, id, { ...draftInput(started), returnNote: "请修改" })
    const resubmitted = await service.submitDoc(author, id, draftInput(returned))
    expect(resubmitted.withdrawal.canWithdraw).toBe(true)
    const restarted = await service.startDocReview(editor, id, draftInput(resubmitted))
    const approved = await service.approveDoc(editor, id, draftInput(restarted))
    expect(approved.doc.status).toBe("approved")
  })

  it("两个窗口同时开始审核只写入一条开始记录", async () => {
    const view = await submitted()
    const input = draftInput(view)
    const results = await Promise.allSettled([
      service.startDocReview(editor, view.doc.docId, input),
      service.startDocReview(editor, view.doc.docId, input),
    ])
    expect(results.some((result) => result.status === "fulfilled")).toBe(true)
    expect(await db.operationLog.count({ where: { docId: BigInt(view.doc.docId), action: "doc.start_review" } })).toBe(1)
    expect((await service.getCurrentDocView(author, view.doc.docId)).withdrawal.blockedReason).toBe("review_started")
  })

  it("通知落库失败时，撤回状态、草稿、历史及待办全部回滚", async () => {
    const view = await submitted()
    // 在独立测试库制造真实 SQL 失败，验证中途异常时事务没有留下半次撤回。
    // MySQL 的触发器 DDL 不支持预处理协议，因此仅此测试用原生 query 执行固定 SQL。
    const ddl = await createConnection(testUrl!.replace(/^mysql:/, "mariadb:"))
    try {
      await ddl.query("CREATE TRIGGER fail_doc_withdraw_notice BEFORE INSERT ON notifications FOR EACH ROW BEGIN IF NEW.type = 'doc_submission_withdrawn' THEN SIGNAL SQLSTATE '45000' SET MESSAGE_TEXT = 'test withdrawal rollback'; END IF; END")
      await expect(service.withdrawDoc(author, view.doc.docId, draftInput(view))).rejects.toThrow()
      const current = await service.getCurrentDocView(author, view.doc.docId)
      expect(current.doc.status).toBe("submitted")
      expect(current.doc.activeDraftId).toBe(view.doc.activeDraftId)
      expect(current.withdrawal.canWithdraw).toBe(true)
      expect(await db.docRevision.count({ where: { docId: BigInt(view.doc.docId) } })).toBe(1)
      expect(await db.todoItem.count({ where: { docId: BigInt(view.doc.docId), status: "open" } })).toBe(1)
    } finally {
      await ddl.query("DROP TRIGGER IF EXISTS fail_doc_withdraw_notice")
      await ddl.end()
    }
  })
})
