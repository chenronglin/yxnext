import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    project: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    doc: {
      create: vi.fn(),
      update: vi.fn(),
    },
    docCurrentDraft: {
      create: vi.fn(),
      update: vi.fn(),
    },
    releaseSourceRevision: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    todoItem: {
      updateMany: vi.fn(),
    },
    projectStagePlan: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      project: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<void>) => callback(tx)),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { regenerateProjectQc } from "@/server/modules/project/project.service"

const NOW = new Date("2026-07-13T10:00:00.000Z")

function makeRevision(revisionId: bigint, text: string) {
  return {
    revisionId,
    revisionNo: 1,
    contentSchemaVersion: 1,
    contentJson: null,
    wordCount: text.length,
    plainText: text,
    cleanText: text,
    exportText: text,
    summary: null,
    commentCount: 0,
    suggestionCount: 0,
    revisionMarkCount: 0,
    contentHash: `hash-${revisionId.toString()}`,
    createdAt: NOW,
  }
}

function makeChapter(input: { docId: bigint; chapterNo: number; sortOrder: number; title: string; text: string }) {
  const finalRevision = makeRevision(input.docId * 10n, input.text)

  return {
    docId: input.docId,
    docType: "chapter",
    stageCode: "chapter",
    title: input.title,
    chapterNo: input.chapterNo,
    sortOrder: input.sortOrder,
    status: "approved",
    holderRole: "none",
    activeDraftId: null,
    latestRevisionId: finalRevision.revisionId,
    finalRevisionId: finalRevision.revisionId,
    currentWordCount: input.text.length,
    currentPlainText: input.text,
    currentCleanText: input.text,
    lastHandoffNote: null,
    lastActionAt: NOW,
    updatedAt: NOW,
    lastActor: null,
    activeDraft: null,
    finalRevision,
  }
}

function makeProject(
  releaseStatus: "locked" | "approved" = "approved",
  lifecycleStatus: "active" | "completed" = "active",
) {
  const chapterEleven = makeChapter({
    docId: 11n,
    chapterNo: 11,
    sortOrder: 1,
    title: "第十一章",
    text: "第十一章正文",
  })
  const chapterOne = makeChapter({
    docId: 1n,
    chapterNo: 1,
    sortOrder: 2,
    title: "第一章",
    text: "第一章正文",
  })
  const releaseRevision = makeRevision(900n, "旧质检内容")
  const releaseDoc = {
    docId: 90n,
    docType: "release",
    stageCode: "release",
    title: "质检",
    chapterNo: null,
    sortOrder: 0,
    status: "approved",
    holderRole: "none",
    activeDraftId: null,
    latestRevisionId: releaseRevision.revisionId,
    finalRevisionId: releaseRevision.revisionId,
    currentWordCount: 6,
    currentPlainText: "旧质检内容",
    currentCleanText: "旧质检内容",
    lastHandoffNote: null,
    lastActionAt: NOW,
    updatedAt: NOW,
    lastActor: null,
    activeDraft: null,
    finalRevision: releaseRevision,
  }
  const stagePlans = [
    {
      stagePlanId: 30n,
      stageCode: "chapter",
      gateStatus: "completed",
      timelineStatus: "completed",
      planDays: 30,
      startedAt: NOW,
      dueAt: NOW,
      completedAt: NOW,
    },
    {
      stagePlanId: 40n,
      stageCode: "release",
      gateStatus: "completed",
      timelineStatus: "completed",
      planDays: 5,
      startedAt: NOW,
      dueAt: NOW,
      completedAt: NOW,
    },
  ]

  return {
    projectId: 100n,
    sourceSiId: 200n,
    title: "重新质检测试项目",
    editorId: 300n,
    authorId: 400n,
    currentStage: lifecycleStatus === "completed" ? "completed" : "release",
    lifecycleStatus,
    releaseStatus,
    completedAt: lifecycleStatus === "completed" ? NOW : null,
    createdAt: NOW,
    updatedAt: NOW,
    sourceSi: {
      siId: 200n,
      title: "测试选题",
      status: "converted",
    },
    editor: {
      userId: 300n,
      username: "editor",
      displayName: "编辑",
    },
    author: {
      userId: 400n,
      username: "author",
      displayName: "作者",
    },
    stagePlans,
    // 故意让第十一章先出现在数据库读取结果中，用于验证重新生成仍按 chapterNo 排序。
    docs: [chapterEleven, chapterOne, releaseDoc],
  }
}

const editorActor = {
  id: "300",
  userId: 300n,
  role: "editor" as const,
  name: "编辑",
  username: "editor",
  displayName: "编辑",
  email: "editor@example.test",
  status: "active" as const,
  passwordResetRequired: false,
  preferredLocale: "zh-CN" as const,
}

describe("regenerateProjectQc", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    const project = makeProject()

    mockTx.project.findFirst.mockResolvedValue(project)
    mockPrisma.project.findFirst.mockResolvedValue(project)
    mockTx.docCurrentDraft.create.mockResolvedValue({ draftId: 999n })
    mockTx.projectStagePlan.findFirst.mockImplementation(({ where }: { where: { stageCode: string } }) =>
      Promise.resolve(project.stagePlans.find((plan) => plan.stageCode === where.stageCode) ?? null),
    )
  })

  it("覆盖旧质检稿、清除旧终稿和待办，并按章节号刷新来源快照", async () => {
    await regenerateProjectQc(editorActor, "100")

    const draftCreateData = mockTx.docCurrentDraft.create.mock.calls[0][0].data
    const generatedHeadings = draftCreateData.contentJson.content
      .filter((block: { type: string }) => block.type === "heading")
      .map((block: { content?: Array<{ text?: string }> }) => block.content?.[0]?.text)

    expect(generatedHeadings).toEqual(["第一章", "第十一章"])
    expect(mockTx.releaseSourceRevision.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({ sourceChapterDocId: 1n, sourceOrder: 1 }),
        expect.objectContaining({ sourceChapterDocId: 11n, sourceOrder: 2 }),
      ],
    })
    expect(mockTx.doc.update).toHaveBeenCalledWith({
      where: { docId: 90n },
      data: expect.objectContaining({
        status: "draft",
        holderRole: "author",
        finalRevisionId: null,
        currentPlainText: "第一章正文\n\n第十一章正文",
      }),
    })
    expect(mockTx.todoItem.updateMany).toHaveBeenCalledWith({
      where: {
        docId: 90n,
        status: "open",
      },
      data: expect.objectContaining({
        status: "cancelled",
        openDedupeKey: null,
      }),
    })
    expect(mockTx.projectStagePlan.update).toHaveBeenCalledWith({
      where: { stagePlanId: 40n },
      data: expect.objectContaining({
        gateStatus: "unlocked",
        timelineStatus: "in_progress",
        completedAt: null,
      }),
    })
    expect(mockTx.project.update).toHaveBeenCalledWith({
      where: { projectId: 100n },
      data: {
        releaseStatus: "unlocked",
        currentStage: "release",
      },
    })
  })

  it("尚未首次解锁质检时拒绝重新生成", async () => {
    mockTx.project.findFirst.mockResolvedValue(makeProject("locked"))

    await expect(regenerateProjectQc(editorActor, "100")).rejects.toMatchObject({
      code: "PROJECT_QC_NOT_UNLOCKED",
    })
    expect(mockTx.docCurrentDraft.create).not.toHaveBeenCalled()
  })

  it("已完成项目重新质检时恢复为活动项目和质检阶段", async () => {
    const completedProject = makeProject("approved", "completed")
    mockTx.project.findFirst.mockResolvedValue(completedProject)
    mockPrisma.project.findFirst.mockResolvedValue(completedProject)
    mockTx.projectStagePlan.findFirst.mockImplementation(({ where }: { where: { stageCode: string } }) =>
      Promise.resolve(completedProject.stagePlans.find((plan) => plan.stageCode === where.stageCode) ?? null),
    )

    await regenerateProjectQc(editorActor, "100")

    expect(mockTx.project.update).toHaveBeenCalledWith({
      where: { projectId: 100n },
      data: {
        releaseStatus: "unlocked",
        currentStage: "release",
        lifecycleStatus: "active",
        completedAt: null,
      },
    })
  })
})
