import { beforeEach, describe, expect, it, vi } from "vitest"

// Vitest 会提升 vi.mock，这里用 hoisted 提前创建 Prisma mock，避免模块初始化先后顺序问题。
const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    doc: {
      findFirst: vi.fn(),
      update: vi.fn(),
      create: vi.fn(),
    },
    docCurrentDraft: {
      updateMany: vi.fn(),
      create: vi.fn(),
    },
    docRevision: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    todoItem: {
      upsert: vi.fn(),
      updateMany: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
    projectStagePlan: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    project: {
      update: vi.fn(),
    },
  }

  const prisma = {
    doc: {
      findFirst: vi.fn(),
    },
    docRevision: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    $transaction: vi.fn(),
  }

  return {
    mockTx: tx,
    mockPrisma: prisma,
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { DocCurrentSource } from "@/types/doc"
import { getCurrentDocView, saveDocDraft, submitDoc, returnDocToAuthor, approveDoc } from "@/server/modules/doc/doc.service"

const FIXED_TIME = new Date("2026-06-09T10:00:00.000Z")

// 所有测试共享一套稳定的当前用户，避免每个断言都去重复拼 BigInt 结构。
const authorActor: ApiCurrentUser = {
  id: "200",
  userId: 200n,
  username: "author_a",
  name: "作者甲",
  role: "author",
  status: "active",
  email: "author@example.com",
}

const editorActor: ApiCurrentUser = {
  id: "100",
  userId: 100n,
  username: "editor_a",
  name: "编辑甲",
  role: "editor",
  status: "active",
  email: "editor@example.com",
}

const adminActor: ApiCurrentUser = {
  id: "1",
  userId: 1n,
  username: "admin_a",
  name: "管理员甲",
  role: "admin",
  status: "active",
  email: "admin@example.com",
}

// 联合类型断言在测试里显式收窄，能让断言更清晰，也避免误把错误状态继续往下用。
function expectDraftSource(source: DocCurrentSource) {
  expect(source.kind).toBe("draft")

  if (source.kind !== "draft") {
    throw new Error("当前 source 不是 draft")
  }

  return source
}

function expectFinalRevisionSource(source: DocCurrentSource) {
  expect(source.kind).toBe("final_revision")

  if (source.kind !== "final_revision") {
    throw new Error("当前 source 不是 final_revision")
  }

  return source
}

function makeUser(userId: bigint, username: string, displayName: string) {
  return {
    userId,
    username,
    displayName,
  }
}

function makeStagePlan(
  stageCode: "synopsis" | "outline" | "chapter" | "release",
  overrides: Partial<{
    stagePlanId: bigint
    gateStatus: "locked" | "unlocked" | "completed"
    timelineStatus: "not_started" | "in_progress" | "due_soon" | "overdue" | "completed"
    planDays: number
    unlockedAt: Date | null
    startedAt: Date | null
    dueAt: Date | null
    completedAt: Date | null
  }> = {},
) {
  return {
    stagePlanId: overrides.stagePlanId ?? BigInt(Math.floor(Math.random() * 1000) + 1),
    stageCode,
    gateStatus: overrides.gateStatus ?? "unlocked",
    timelineStatus: overrides.timelineStatus ?? "in_progress",
    planDays: overrides.planDays ?? 7,
    unlockedAt: overrides.unlockedAt ?? FIXED_TIME,
    startedAt: overrides.startedAt ?? FIXED_TIME,
    dueAt: overrides.dueAt ?? new Date("2026-06-16T10:00:00.000Z"),
    completedAt: overrides.completedAt ?? null,
  }
}

function makeDraft(
  overrides: Partial<{
    draftId: bigint
    docId: bigint
    ownerRole: "author" | "editor"
    ownerUserId: bigint
    baseRevisionId: bigint | null
    contentSchemaVersion: number
    contentJson: Record<string, unknown>
    wordCount: number
    plainText: string | null
    cleanText: string | null
    exportText: string | null
    summary: string | null
    commentCount: number
    suggestionCount: number
    revisionMarkCount: number
    status: "active" | "sealed" | "archived"
    lockVersion: number
    saveCount: number
    createdAt: Date
    updatedAt: Date
    sealedAt: Date | null
  }> = {},
) {
  return {
    draftId: overrides.draftId ?? 501n,
    docId: overrides.docId ?? 1n,
    ownerRole: overrides.ownerRole ?? "author",
    ownerUserId: overrides.ownerUserId ?? authorActor.userId,
    baseRevisionId: overrides.baseRevisionId ?? null,
    contentSchemaVersion: overrides.contentSchemaVersion ?? 1,
    contentJson: overrides.contentJson ?? { type: "doc", content: [] },
    wordCount: overrides.wordCount ?? 1200,
    plainText: overrides.plainText ?? "这里是正文",
    cleanText: overrides.cleanText ?? "这里是正文",
    exportText: overrides.exportText ?? "这里是正文",
    summary: overrides.summary ?? "摘要",
    commentCount: overrides.commentCount ?? 0,
    suggestionCount: overrides.suggestionCount ?? 0,
    revisionMarkCount: overrides.revisionMarkCount ?? 0,
    status: overrides.status ?? "active",
    lockVersion: overrides.lockVersion ?? 3,
    saveCount: overrides.saveCount ?? 2,
    createdAt: overrides.createdAt ?? FIXED_TIME,
    updatedAt: overrides.updatedAt ?? FIXED_TIME,
    sealedAt: overrides.sealedAt ?? null,
  }
}

function makeRevision(
  overrides: Partial<{
    revisionId: bigint
    docId: bigint
    revisionNo: number
    baseRevisionId: bigint | null
    baseRevision: { revisionId: bigint; revisionNo: number } | null
    fromDraftId: bigint
    contentSchemaVersion: number
    contentJson: Record<string, unknown>
    wordCount: number
    plainText: string | null
    cleanText: string | null
    exportText: string | null
    summary: string | null
    commentCount: number
    suggestionCount: number
    revisionMarkCount: number
    action: "author_submit" | "editor_reject" | "editor_approve"
    actorRole: "author" | "editor" | "admin"
    actorUserId: bigint
    actor: { userId: bigint; username: string; displayName: string | null }
    handoffNote: string | null
    contentHash: string | null
    createdAt: Date
  }> = {},
) {
  return {
    revisionId: overrides.revisionId ?? 801n,
    docId: overrides.docId ?? 1n,
    revisionNo: overrides.revisionNo ?? 3,
    baseRevisionId: overrides.baseRevisionId ?? null,
    baseRevision: overrides.baseRevision ?? null,
    fromDraftId: overrides.fromDraftId ?? 501n,
    contentSchemaVersion: overrides.contentSchemaVersion ?? 1,
    contentJson: overrides.contentJson ?? { type: "doc", content: [] },
    wordCount: overrides.wordCount ?? 1300,
    plainText: overrides.plainText ?? "最终正文",
    cleanText: overrides.cleanText ?? "最终正文",
    exportText: overrides.exportText ?? "最终正文",
    summary: overrides.summary ?? "最终摘要",
    commentCount: overrides.commentCount ?? 1,
    suggestionCount: overrides.suggestionCount ?? 1,
    revisionMarkCount: overrides.revisionMarkCount ?? 0,
    action: overrides.action ?? "editor_approve",
    actorRole: overrides.actorRole ?? "editor",
    actorUserId: overrides.actorUserId ?? editorActor.userId,
    actor: overrides.actor ?? makeUser(editorActor.userId, editorActor.username, editorActor.name),
    handoffNote: overrides.handoffNote ?? "审核通过",
    contentHash: overrides.contentHash ?? "hash-001",
    createdAt: overrides.createdAt ?? FIXED_TIME,
  }
}

function makeDocRecord(
  overrides: Partial<{
    docId: bigint
    projectId: bigint
    docType: "synopsis" | "outline" | "chapter" | "release"
    stageCode: "synopsis" | "outline" | "chapter" | "release"
    title: string
    chapterNo: number | null
    sortOrder: number
    status: "draft" | "submitted" | "rejected" | "approved"
    holderRole: "author" | "editor" | "none"
    activeDraftId: bigint | null
    latestRevisionId: bigint | null
    finalRevisionId: bigint | null
    currentWordCount: number
    currentPlainText: string | null
    currentCleanText: string | null
    summary: string | null
    lastAction: "author_save" | "editor_save" | "author_submit" | "editor_reject" | "editor_approve" | null
    lastActorId: bigint | null
    lastActionAt: Date | null
    lastHandoffNote: string | null
    submittedAt: Date | null
    reviewedAt: Date | null
    approvedAt: Date | null
    createdAt: Date
    updatedAt: Date
    project: {
      projectId: bigint
      title: string
      editorId: bigint
      authorId: bigint
      lifecycleStatus: "draft" | "active" | "completed" | "archived" | "cancelled"
      currentStage: "synopsis" | "outline" | "chapter" | "release" | "completed"
      releaseStatus: "locked" | "unlocked" | "approved"
      editor: { userId: bigint; username: string; displayName: string | null }
      author: { userId: bigint; username: string; displayName: string | null }
      stagePlans: ReturnType<typeof makeStagePlan>[]
    }
    activeDraft: ReturnType<typeof makeDraft> | null
    finalRevision: ReturnType<typeof makeRevision> | null
    latestRevision: ReturnType<typeof makeRevision> | null
    lastActor: { userId: bigint; username: string; displayName: string | null } | null
  }> = {},
) {
  const hasOverride = <T extends object>(source: T, key: keyof T) => Object.prototype.hasOwnProperty.call(source, key)
  const stageCode = overrides.stageCode ?? "synopsis"
  const stagePlans =
    overrides.project?.stagePlans ??
    [
      makeStagePlan("synopsis"),
      makeStagePlan("outline", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
      makeStagePlan("chapter", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
      makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
    ]

  return {
    docId: overrides.docId ?? 1n,
    projectId: overrides.projectId ?? 10n,
    docType: overrides.docType ?? stageCode,
    stageCode,
    title: overrides.title ?? "梗概",
    chapterNo: hasOverride(overrides, "chapterNo") ? (overrides.chapterNo ?? null) : null,
    sortOrder: overrides.sortOrder ?? 0,
    status: overrides.status ?? "draft",
    holderRole: overrides.holderRole ?? "author",
    activeDraftId: hasOverride(overrides, "activeDraftId") ? (overrides.activeDraftId ?? null) : 501n,
    latestRevisionId: hasOverride(overrides, "latestRevisionId") ? (overrides.latestRevisionId ?? null) : null,
    finalRevisionId: hasOverride(overrides, "finalRevisionId") ? (overrides.finalRevisionId ?? null) : null,
    currentWordCount: overrides.currentWordCount ?? 1200,
    currentPlainText: hasOverride(overrides, "currentPlainText") ? (overrides.currentPlainText ?? null) : "这里是正文",
    currentCleanText: hasOverride(overrides, "currentCleanText") ? (overrides.currentCleanText ?? null) : "这里是正文",
    summary: hasOverride(overrides, "summary") ? (overrides.summary ?? null) : "摘要",
    lastAction: hasOverride(overrides, "lastAction") ? (overrides.lastAction ?? null) : "author_save",
    lastActorId: hasOverride(overrides, "lastActorId") ? (overrides.lastActorId ?? null) : authorActor.userId,
    lastActionAt: hasOverride(overrides, "lastActionAt") ? (overrides.lastActionAt ?? null) : FIXED_TIME,
    lastHandoffNote: hasOverride(overrides, "lastHandoffNote") ? (overrides.lastHandoffNote ?? null) : null,
    submittedAt: hasOverride(overrides, "submittedAt") ? (overrides.submittedAt ?? null) : null,
    reviewedAt: hasOverride(overrides, "reviewedAt") ? (overrides.reviewedAt ?? null) : null,
    approvedAt: hasOverride(overrides, "approvedAt") ? (overrides.approvedAt ?? null) : null,
    createdAt: overrides.createdAt ?? FIXED_TIME,
    updatedAt: overrides.updatedAt ?? FIXED_TIME,
    project: overrides.project ?? {
      projectId: overrides.projectId ?? 10n,
      title: "测试项目",
      editorId: editorActor.userId,
      authorId: authorActor.userId,
      lifecycleStatus: "active",
      currentStage: stageCode,
      releaseStatus: "unlocked",
      editor: makeUser(editorActor.userId, editorActor.username, editorActor.name),
      author: makeUser(authorActor.userId, authorActor.username, authorActor.name),
      stagePlans,
    },
    activeDraft: hasOverride(overrides, "activeDraft") ? (overrides.activeDraft ?? null) : makeDraft({ docId: overrides.docId ?? 1n }),
    finalRevision: hasOverride(overrides, "finalRevision") ? (overrides.finalRevision ?? null) : null,
    latestRevision: hasOverride(overrides, "latestRevision") ? (overrides.latestRevision ?? null) : null,
    lastActor: hasOverride(overrides, "lastActor") ? (overrides.lastActor ?? null) : makeUser(authorActor.userId, authorActor.username, authorActor.name),
  }
}

beforeEach(() => {
  vi.useFakeTimers()
  vi.setSystemTime(FIXED_TIME)
  vi.clearAllMocks()

  mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx))

  mockTx.doc.update.mockResolvedValue(undefined)
  mockTx.doc.create.mockResolvedValue({ docId: 900n })
  mockTx.docCurrentDraft.updateMany.mockResolvedValue({ count: 1 })
  mockTx.docCurrentDraft.create.mockResolvedValue(makeDraft({ draftId: 777n, ownerRole: "editor", ownerUserId: editorActor.userId }))
  mockTx.docRevision.findFirst.mockResolvedValue({ revisionNo: 2 })
  mockTx.docRevision.create.mockResolvedValue(makeRevision({ revisionId: 901n, revisionNo: 3 }))
  mockTx.todoItem.upsert.mockResolvedValue(undefined)
  mockTx.todoItem.updateMany.mockResolvedValue({ count: 1 })
  mockTx.notification.create.mockResolvedValue(undefined)
  mockTx.operationLog.create.mockResolvedValue(undefined)
  mockTx.projectStagePlan.findFirst.mockResolvedValue(makeStagePlan("synopsis"))
  mockTx.projectStagePlan.update.mockResolvedValue(undefined)
  mockTx.project.update.mockResolvedValue(undefined)
  mockPrisma.docRevision.findMany.mockResolvedValue([])
})

describe("getCurrentDocView", () => {
  it("在已通过且没有 active draft 时回退到 finalRevision", async () => {
    const finalRevision = makeRevision({
      revisionId: 999n,
      revisionNo: 5,
      action: "editor_approve",
      actorRole: "editor",
      actorUserId: editorActor.userId,
      actor: makeUser(editorActor.userId, editorActor.username, editorActor.name),
    })

    mockPrisma.doc.findFirst.mockResolvedValueOnce(
      makeDocRecord({
        status: "approved",
        holderRole: "none",
        activeDraftId: null,
        activeDraft: null,
        latestRevisionId: 999n,
        finalRevisionId: 999n,
        latestRevision: finalRevision,
        finalRevision,
      }),
    )

    const result = await getCurrentDocView(authorActor, "1")

    const source = expectFinalRevisionSource(result.source)

    expect(source.revisionId).toBe("999")
    expect(result.doc.status).toBe("approved")
    expect(result.permissions.canSave).toBe(false)
  })
})

describe("saveDocDraft", () => {
  it("作者保存成功时只更新 CurrentDraft 并递增 lockVersion，不生成 Revision", async () => {
    const beforeDoc = makeDocRecord({
      status: "draft",
      holderRole: "author",
      activeDraft: makeDraft({ ownerRole: "author", ownerUserId: authorActor.userId, lockVersion: 3 }),
    })
    const afterDoc = makeDocRecord({
      status: "draft",
      holderRole: "author",
      activeDraft: makeDraft({ ownerRole: "author", ownerUserId: authorActor.userId, lockVersion: 4, wordCount: 2222 }),
      currentWordCount: 2222,
      currentPlainText: "更新后的正文",
      currentCleanText: "更新后的正文",
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await saveDocDraft(authorActor, "1", {
      lockVersion: 3,
      contentJson: { type: "doc", content: [] },
      wordCount: 2222,
      plainText: "更新后的正文",
    })

    expect(mockTx.docCurrentDraft.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          draftId: beforeDoc.activeDraft!.draftId,
          lockVersion: 3,
        }),
      }),
    )
    const source = expectDraftSource(result.source)

    expect(mockTx.docRevision.create).not.toHaveBeenCalled()
    expect(source.lockVersion).toBe(4)
    expect(result.doc.currentWordCount).toBe(2222)
  })

  it("非持有人不能保存", async () => {
    mockTx.doc.findFirst.mockResolvedValueOnce(
      makeDocRecord({
        status: "submitted",
        holderRole: "editor",
        activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId }),
      }),
    )

    await expect(
      saveDocDraft(authorActor, "1", {
        lockVersion: 3,
        contentJson: { type: "doc", content: [] },
        wordCount: 100,
        plainText: "正文",
      }),
    ).rejects.toMatchObject({
      code: "DOC_NOT_HOLDER",
      status: 403,
    })
  })

  it("lockVersion 冲突时返回 409", async () => {
    mockTx.doc.findFirst.mockResolvedValueOnce(makeDocRecord())
    mockTx.docCurrentDraft.updateMany.mockResolvedValueOnce({ count: 0 })

    await expect(
      saveDocDraft(authorActor, "1", {
        lockVersion: 99,
        contentJson: { type: "doc", content: [] },
        wordCount: 100,
        plainText: "正文",
      }),
    ).rejects.toMatchObject({
      code: "DOC_LOCK_VERSION_CONFLICT",
      status: 409,
    })
  })

  it("全文质检未解锁时保存被拒绝", async () => {
    mockTx.doc.findFirst.mockResolvedValueOnce(
      makeDocRecord({
        docType: "release",
        stageCode: "release",
        title: "全文质检",
        project: {
          ...makeDocRecord().project,
          currentStage: "release",
          releaseStatus: "locked",
          stagePlans: [
            makeStagePlan("synopsis", { gateStatus: "completed", timelineStatus: "completed" }),
            makeStagePlan("outline", { gateStatus: "completed", timelineStatus: "completed" }),
            makeStagePlan("chapter", { gateStatus: "completed", timelineStatus: "completed" }),
            makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
          ],
        },
        activeDraft: makeDraft({ ownerRole: "author", ownerUserId: authorActor.userId }),
      }),
    )

    await expect(
      saveDocDraft(authorActor, "1", {
        lockVersion: 3,
        contentJson: { type: "doc", content: [] },
        wordCount: 100,
        plainText: "正文",
      }),
    ).rejects.toMatchObject({
      code: "DOC_RELEASE_LOCKED",
      status: 409,
    })
  })
})

describe("submitDoc", () => {
  it("作者提交成功时生成 author_submit Revision，切换 holder 给编辑，并创建待审待办", async () => {
    const beforeDoc = makeDocRecord({
      status: "draft",
      holderRole: "author",
      activeDraft: makeDraft({ ownerRole: "author", ownerUserId: authorActor.userId, lockVersion: 3 }),
    })
    const afterDoc = makeDocRecord({
      status: "submitted",
      holderRole: "editor",
      activeDraftId: 777n,
      latestRevisionId: 901n,
      activeDraft: makeDraft({ draftId: 777n, ownerRole: "editor", ownerUserId: editorActor.userId }),
      lastAction: "author_submit",
      submittedAt: FIXED_TIME,
      lastHandoffNote: "请老师复审",
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await submitDoc(authorActor, "1", {
      lockVersion: 3,
      submitNote: "请老师复审",
    })

    expect(mockTx.docRevision.create).toHaveBeenCalled()
    expect(mockTx.todoItem.upsert).toHaveBeenCalled()
    expect(mockTx.notification.create).toHaveBeenCalled()
    const source = expectDraftSource(result.source)

    expect(result.doc.status).toBe("submitted")
    expect(source.ownerRole).toBe("editor")
  })

  it("锁阶段允许保存但不能提交", async () => {
    mockTx.doc.findFirst.mockResolvedValueOnce(
      makeDocRecord({
        docType: "outline",
        stageCode: "outline",
        title: "细纲",
        project: {
          ...makeDocRecord().project,
          currentStage: "synopsis",
          stagePlans: [
            makeStagePlan("synopsis"),
            makeStagePlan("outline", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
            makeStagePlan("chapter", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
            makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
          ],
        },
      }),
    )

    await expect(
      submitDoc(authorActor, "1", {
        lockVersion: 3,
        submitNote: "提交细纲",
      }),
    ).rejects.toMatchObject({
      code: "DOC_STAGE_LOCKED",
      status: 409,
    })
  })
})

describe("returnDocToAuthor", () => {
  it("退回说明为空时直接报错", async () => {
    await expect(
      returnDocToAuthor(editorActor, "1", {
        lockVersion: 3,
        returnNote: "   ",
      }),
    ).rejects.toMatchObject({
      code: "DOC_RETURN_NOTE_REQUIRED",
      status: 400,
    })
  })

  it("管理员不能保存正文，但可以执行退回审核", async () => {
    mockTx.doc.findFirst.mockResolvedValueOnce(
      makeDocRecord({
        status: "submitted",
        holderRole: "editor",
        activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId }),
      }),
    )

    await expect(
      saveDocDraft(adminActor, "1", {
        lockVersion: 3,
        contentJson: { type: "doc", content: [] },
        wordCount: 100,
        plainText: "正文",
      }),
    ).rejects.toMatchObject({
      code: "DOC_NOT_HOLDER",
      status: 403,
    })

    const beforeDoc = makeDocRecord({
      status: "submitted",
      holderRole: "editor",
      activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId, lockVersion: 3 }),
    })
    const afterDoc = makeDocRecord({
      status: "rejected",
      holderRole: "author",
      activeDraftId: 777n,
      latestRevisionId: 901n,
      activeDraft: makeDraft({ draftId: 777n, ownerRole: "author", ownerUserId: authorActor.userId }),
      lastAction: "editor_reject",
      reviewedAt: FIXED_TIME,
      lastHandoffNote: "请补强中段冲突",
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await returnDocToAuthor(adminActor, "1", {
      lockVersion: 3,
      returnNote: "请补强中段冲突",
    })

    const source = expectDraftSource(result.source)

    expect(result.doc.status).toBe("returned")
    expect(source.ownerRole).toBe("author")
  })

  it("编辑退回成功时关闭待审待办并生成作者待改待办", async () => {
    const beforeDoc = makeDocRecord({
      status: "submitted",
      holderRole: "editor",
      activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId, lockVersion: 3 }),
    })
    const afterDoc = makeDocRecord({
      status: "rejected",
      holderRole: "author",
      activeDraftId: 777n,
      latestRevisionId: 901n,
      activeDraft: makeDraft({ draftId: 777n, ownerRole: "author", ownerUserId: authorActor.userId }),
      lastAction: "editor_reject",
      reviewedAt: FIXED_TIME,
      lastHandoffNote: "请按建议重写",
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await returnDocToAuthor(editorActor, "1", {
      lockVersion: 3,
      returnNote: "请按建议重写",
    })

    const source = expectDraftSource(result.source)

    expect(mockTx.todoItem.updateMany).toHaveBeenCalled()
    expect(mockTx.todoItem.upsert).toHaveBeenCalled()
    expect(result.doc.status).toBe("returned")
    expect(source.ownerRole).toBe("author")
  })
})

describe("approveDoc", () => {
  it("编辑通过梗概后会设置 finalRevisionId、自动创建细纲 Doc 并推进到 outline", async () => {
    const beforeDoc = makeDocRecord({
      stageCode: "synopsis",
      docType: "synopsis",
      title: "梗概",
      status: "submitted",
      holderRole: "editor",
      project: {
        ...makeDocRecord().project,
        currentStage: "synopsis",
        stagePlans: [
          makeStagePlan("synopsis"),
          makeStagePlan("outline", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
          makeStagePlan("chapter", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
          makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
        ],
      },
      activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId, lockVersion: 3 }),
    })
    const finalRevision = makeRevision({
      revisionId: 901n,
      revisionNo: 3,
      action: "editor_approve",
      actorRole: "editor",
      actorUserId: editorActor.userId,
      actor: makeUser(editorActor.userId, editorActor.username, editorActor.name),
    })
    const afterDoc = makeDocRecord({
      stageCode: "synopsis",
      docType: "synopsis",
      title: "梗概",
      status: "approved",
      holderRole: "none",
      activeDraftId: null,
      activeDraft: null,
      latestRevisionId: 901n,
      finalRevisionId: 901n,
      latestRevision: finalRevision,
      finalRevision,
      lastAction: "editor_approve",
      approvedAt: FIXED_TIME,
      reviewedAt: FIXED_TIME,
      lastHandoffNote: "通过",
      project: {
        ...beforeDoc.project,
        currentStage: "outline",
      },
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc).mockResolvedValueOnce(null)
    mockTx.projectStagePlan.findFirst
      .mockResolvedValueOnce(makeStagePlan("synopsis"))
      .mockResolvedValueOnce(makeStagePlan("outline", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }))
    mockTx.doc.create.mockResolvedValueOnce({ docId: 900n })
    mockTx.docCurrentDraft.create.mockResolvedValueOnce(makeDraft({ draftId: 778n, docId: 900n, ownerRole: "author", ownerUserId: authorActor.userId }))
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await approveDoc(editorActor, "1", {
      lockVersion: 3,
      approveNote: "通过",
    })

    expect(mockTx.doc.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { docId: beforeDoc.docId },
        data: expect.objectContaining({
          finalRevisionId: 901n,
          activeDraftId: null,
        }),
      }),
    )
    expect(mockTx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStage: "outline",
        }),
      }),
    )
    const source = expectFinalRevisionSource(result.source)

    expect(mockTx.doc.create).toHaveBeenCalled()
    expect(result.doc.finalRevisionId).toBe("901")
    expect(source.kind).toBe("final_revision")
  })

  it("细纲通过后推进到正文阶段，但不自动创建章节 Doc", async () => {
    const beforeDoc = makeDocRecord({
      stageCode: "outline",
      docType: "outline",
      title: "细纲",
      status: "submitted",
      holderRole: "editor",
      project: {
        ...makeDocRecord().project,
        currentStage: "outline",
        stagePlans: [
          makeStagePlan("synopsis", { gateStatus: "completed", timelineStatus: "completed" }),
          makeStagePlan("outline"),
          makeStagePlan("chapter", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
          makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
        ],
      },
      activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId }),
    })
    const finalRevision = makeRevision({ revisionId: 902n, revisionNo: 4 })
    const afterDoc = makeDocRecord({
      stageCode: "outline",
      docType: "outline",
      title: "细纲",
      status: "approved",
      holderRole: "none",
      activeDraftId: null,
      activeDraft: null,
      latestRevisionId: 902n,
      finalRevisionId: 902n,
      latestRevision: finalRevision,
      finalRevision,
      project: {
        ...beforeDoc.project,
        currentStage: "chapter",
      },
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockTx.projectStagePlan.findFirst
      .mockResolvedValueOnce(makeStagePlan("outline"))
      .mockResolvedValueOnce(makeStagePlan("chapter", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }))
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await approveDoc(editorActor, "1", {
      lockVersion: 3,
      approveNote: "通过细纲",
    })

    expect(mockTx.project.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentStage: "chapter",
        }),
      }),
    )
    expect(mockTx.doc.create).not.toHaveBeenCalled()
    expect(result.doc.status).toBe("approved")
  })

  it("正文章节通过时不自动解锁 Release，也不改项目阶段", async () => {
    const beforeDoc = makeDocRecord({
      stageCode: "chapter",
      docType: "chapter",
      title: "第一章",
      status: "submitted",
      holderRole: "editor",
      project: {
        ...makeDocRecord().project,
        currentStage: "chapter",
        releaseStatus: "locked",
        stagePlans: [
          makeStagePlan("synopsis", { gateStatus: "completed", timelineStatus: "completed" }),
          makeStagePlan("outline", { gateStatus: "completed", timelineStatus: "completed" }),
          makeStagePlan("chapter"),
          makeStagePlan("release", { gateStatus: "locked", timelineStatus: "not_started", unlockedAt: null, startedAt: null, dueAt: null }),
        ],
      },
      activeDraft: makeDraft({ ownerRole: "editor", ownerUserId: editorActor.userId }),
    })
    const finalRevision = makeRevision({ revisionId: 903n, revisionNo: 5 })
    const afterDoc = makeDocRecord({
      stageCode: "chapter",
      docType: "chapter",
      title: "第一章",
      status: "approved",
      holderRole: "none",
      activeDraftId: null,
      activeDraft: null,
      latestRevisionId: 903n,
      finalRevisionId: 903n,
      latestRevision: finalRevision,
      finalRevision,
      project: {
        ...beforeDoc.project,
        currentStage: "chapter",
        releaseStatus: "locked",
      },
    })

    mockTx.doc.findFirst.mockResolvedValueOnce(beforeDoc)
    mockPrisma.doc.findFirst.mockResolvedValueOnce(afterDoc)

    const result = await approveDoc(editorActor, "1", {
      lockVersion: 3,
      approveNote: "章节通过",
    })

    expect(mockTx.project.update).not.toHaveBeenCalled()
    expect(result.project.currentStage).toBe("chapter")
    expect(result.project.releaseStatus).toBe("locked")
  })
})
