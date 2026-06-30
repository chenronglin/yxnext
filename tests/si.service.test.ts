import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    siPreissue: {
      findUnique: vi.fn(),
      findMany: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    editorAuthorBinding: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
    },
    project: {
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    stagePlanDefault: {
      findMany: vi.fn(),
    },
    projectStagePlan: {
      createMany: vi.fn(),
    },
    doc: {
      create: vi.fn(),
      update: vi.fn(),
    },
    docCurrentDraft: {
      create: vi.fn(),
    },
    storyIdea: {
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    notification: {
      create: vi.fn(),
      createMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }
  const prisma = {
    $transaction: vi.fn(async (callback: (txClient: typeof tx) => Promise<unknown>) => callback(tx)),
    siPreissue: {
      findMany: vi.fn(),
      count: vi.fn(),
      findUniqueOrThrow: vi.fn(),
    },
  }

  return {
    mockPrisma: prisma,
    mockTx: tx,
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { convertSiPreissueToProject, listSiPreissues, prepublishStoryIdea } from "@/server/modules/si/si.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const authorActor: ApiCurrentUser = {
  id: "200",
  userId: 200n,
  username: "author_a",
  name: "作者甲",
  role: "author",
  status: "active",
  preferredLocale: "zh-CN",
  email: "author@example.com",
}

const editorActor: ApiCurrentUser = {
  id: "100",
  userId: 100n,
  username: "editor_a",
  name: "编辑甲",
  role: "editor",
  status: "active",
  preferredLocale: "zh-CN",
  email: "editor@example.com",
}

describe("si.service", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.siPreissue.findMany.mockResolvedValue([])
    mockPrisma.siPreissue.count.mockResolvedValue(0)
  })

  it("作者列预发记录时不能用 authorId 参数覆盖本人归属过滤", async () => {
    await listSiPreissues(authorActor, {
      authorId: "999",
    })

    // 作者端 authorId 必须固定为当前登录用户，防止通过查询参数读取其他作者的预发记录。
    expect(mockPrisma.siPreissue.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: 200n,
          status: {
            not: "recalled",
          },
        }),
      }),
    )
    expect(mockPrisma.siPreissue.count).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          authorId: 200n,
          status: {
            not: "recalled",
          },
        }),
      }),
    )
  })

  it("SI 预发通知保留预发说明和预发记录 ID", async () => {
    const preissuedAt = new Date("2026-06-16T08:00:00.000Z")
    const storyIdea = {
      siId: 20n,
      title: "测试选题",
      mainTypeId: null,
      trope: null,
      fitAuthorNote: null,
      remarks: null,
      freshTwist: "新鲜点",
      coreSynopsis: "核心梗概",
      creatorEditorId: editorActor.userId,
      status: "draft",
      currentVersionNo: 1,
      latestVersionId: 30n,
      mainType: null,
      fitAuthors: [],
    }
    const preissueRecord = {
      preissueId: 10n,
      siId: 20n,
      siVersionId: 30n,
      editorId: editorActor.userId,
      authorId: authorActor.userId,
      preissueNote: "适合都市悬疑作者试写",
      siSnapshotJson: {
        title: "测试选题",
        freshTwist: "新鲜点",
        coreSynopsis: "核心梗概",
      },
      status: "preissued",
      projectId: null,
      preissuedAt,
      recalledAt: null,
      convertedAt: null,
      storyIdea: {
        ...storyIdea,
        mainType: null,
      },
      editor: {
        userId: editorActor.userId,
        username: editorActor.username,
        displayName: editorActor.name,
      },
      author: {
        userId: authorActor.userId,
        username: authorActor.username,
        displayName: authorActor.name,
      },
      project: null,
    }

    vi.mocked(mockTx.storyIdea.findUnique).mockResolvedValue(storyIdea)
    vi.mocked(mockTx.user.findMany).mockResolvedValue([{ userId: authorActor.userId }])
    vi.mocked(mockTx.editorAuthorBinding.findMany).mockResolvedValue([{ authorId: authorActor.userId }])
    vi.mocked(mockTx.siPreissue.findMany).mockResolvedValue([])
    vi.mocked(mockTx.siPreissue.create).mockResolvedValue(preissueRecord)
    vi.mocked(mockTx.storyIdea.update).mockResolvedValue({})
    vi.mocked(mockTx.notification.createMany).mockResolvedValue({ count: 1 })
    vi.mocked(mockTx.operationLog.create).mockResolvedValue({})

    const result = await prepublishStoryIdea(editorActor, "20", {
      authorIds: [authorActor.id],
      note: "适合都市悬疑作者试写",
    })

    expect(mockTx.notification.createMany).toHaveBeenCalledWith({
      data: [
        expect.objectContaining({
          recipientUserId: authorActor.userId,
          type: "si_preissued",
          messageKey: "notifications.siPrereleaseWithNote",
          messageParams: expect.objectContaining({
            siTitle: "测试选题",
            preissueNote: "适合都市悬疑作者试写",
          }),
          preissueId: 10n,
          entityId: 10n,
        }),
      ],
    })
    expect(result.records[0]).toEqual(
      expect.objectContaining({
        id: "10",
        note: "适合都市悬疑作者试写",
      }),
    )
  })

  it("SI 转项目创建梗概稿时不再把 SI 正文预填进作者编辑器", async () => {
    const preissuedAt = new Date("2026-06-16T08:00:00.000Z")
    const convertedAt = new Date("2026-06-16T08:10:00.000Z")
    const sourceSynopsis = "这是编辑写好的 SI 核心梗概，作者不应再在梗概框里看到它。"

    vi.mocked(mockTx.siPreissue.findUnique).mockResolvedValue({
      preissueId: 10n,
      siId: 20n,
      siVersionId: 30n,
      editorId: 100n,
      authorId: 200n,
      status: "preissued",
      preissueNote: null,
      siSnapshotJson: {
        title: "测试项目",
        freshTwist: "保留在项目 intro 的亮点",
        coreSynopsis: sourceSynopsis,
      },
      projectId: null,
      preissuedAt,
      recalledAt: null,
      convertedAt: null,
      storyIdea: {
        siId: 20n,
        title: "测试项目",
        mainTypeId: null,
        trope: null,
        freshTwist: "保留在项目 intro 的亮点",
        coreSynopsis: sourceSynopsis,
        creatorEditorId: 100n,
        status: "preissued",
        currentVersionNo: 1,
        latestVersionId: 30n,
        fitAuthorNote: null,
        remarks: null,
        createdAt: preissuedAt,
        updatedAt: preissuedAt,
        mainType: null,
      },
    })
    vi.mocked(mockTx.editorAuthorBinding.findFirst).mockResolvedValue({ bindingId: 1n })
    vi.mocked(mockTx.project.findFirst).mockResolvedValue(null)
    vi.mocked(mockTx.project.create).mockResolvedValue({ projectId: 300n })
    vi.mocked(mockTx.stagePlanDefault.findMany).mockResolvedValue([])
    vi.mocked(mockTx.projectStagePlan.createMany).mockResolvedValue({ count: 4 })
    vi.mocked(mockTx.doc.create).mockResolvedValue({ docId: 400n })
    vi.mocked(mockTx.docCurrentDraft.create).mockResolvedValue({ draftId: 500n })
    vi.mocked(mockTx.doc.update).mockResolvedValue({})
    vi.mocked(mockTx.siPreissue.update).mockResolvedValue({})
    vi.mocked(mockTx.siPreissue.updateMany).mockResolvedValue({ count: 0 })
    vi.mocked(mockTx.storyIdea.update).mockResolvedValue({})
    vi.mocked(mockTx.notification.create).mockResolvedValue({})
    vi.mocked(mockTx.operationLog.create).mockResolvedValue({})
    mockPrisma.siPreissue.findUniqueOrThrow.mockResolvedValue({
      preissueId: 10n,
      siId: 20n,
      siVersionId: 30n,
      editorId: 100n,
      authorId: 200n,
      status: "converted",
      preissueNote: null,
      siSnapshotJson: {
        title: "测试项目",
        freshTwist: "保留在项目 intro 的亮点",
        coreSynopsis: sourceSynopsis,
      },
      projectId: 300n,
      preissuedAt,
      recalledAt: null,
      convertedAt,
      storyIdea: {
        title: "测试项目",
        mainType: null,
        trope: null,
        freshTwist: "保留在项目 intro 的亮点",
        coreSynopsis: sourceSynopsis,
      },
      editor: {
        userId: 100n,
        username: "editor_a",
        displayName: "编辑甲",
      },
      author: {
        userId: 200n,
        username: "author_a",
        displayName: "作者甲",
      },
      project: {
        projectId: 300n,
        title: "测试项目",
        currentStage: "synopsis",
      },
    })

    await convertSiPreissueToProject(editorActor, "10")

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          intro: sourceSynopsis,
        }),
      }),
    )
    expect(mockTx.doc.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          currentWordCount: 0,
          currentPlainText: null,
          currentCleanText: null,
          summary: null,
          lastAction: null,
          lastActorId: null,
          lastActionAt: null,
        }),
      }),
    )
    expect(mockTx.docCurrentDraft.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          wordCount: 0,
          plainText: null,
          cleanText: null,
          exportText: null,
          summary: null,
          contentJson: expect.objectContaining({
            type: "doc",
            attrs: expect.objectContaining({
              schemaVersion: 1,
              docType: "synopsis",
              title: "梗概",
            }),
            content: [],
          }),
        }),
      }),
    )
  })
})
