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
      update: vi.fn(),
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
    storyIdeaVersion: {
      create: vi.fn(),
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

import {
  convertSiPreissueToProject,
  listSiPreissues,
  prepublishStoryIdea,
  updateStoryIdeaTitle,
} from "@/server/modules/si/si.service"
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

    await convertSiPreissueToProject(editorActor, "10", {
      projectTitle: "  独立项目名称  ",
    })

    expect(mockTx.project.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          // 项目名称使用用户在转项目弹窗中确认的值，不再被 SI 快照名称覆盖。
          title: "独立项目名称",
          intro: sourceSynopsis,
        }),
      }),
    )
    expect(mockTx.storyIdea.update).toHaveBeenCalledWith({
      where: {
        siId: 20n,
      },
      data: {
        // 转项目只推进 SI 状态，不应把独立项目名称反向写回 SI.title。
        status: "converted",
      },
    })
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

describe("updateStoryIdeaTitle", () => {
  const originalUpdatedAt = new Date("2026-08-10T08:00:00.000Z")
  const renamedUpdatedAt = new Date("2026-08-10T08:10:00.000Z")

  function makeConvertedStoryIdea() {
    return {
      siId: 20n,
      title: "转项目前的 SI 标题",
      mainTypeId: 5n,
      trope: "身份反转",
      fitAuthorNote: "适合悬疑作者",
      remarks: "内部备注",
      freshTwist: "叙述性诡计",
      coreSynopsis: "核心梗概",
      creatorEditorId: editorActor.userId,
      status: "converted",
      currentVersionNo: 3,
      latestVersionId: 30n,
      createdAt: new Date("2026-08-01T08:00:00.000Z"),
      updatedAt: originalUpdatedAt,
      archivedAt: null,
      mainType: {
        mainTypeId: 5n,
        name: "悬疑推理",
      },
      fitAuthors: [
        {
          siId: 20n,
          authorId: authorActor.userId,
        },
      ],
    }
  }

  beforeEach(() => {
    vi.clearAllMocks()
    mockTx.storyIdea.findUnique.mockResolvedValue(makeConvertedStoryIdea())
    mockTx.storyIdea.update
      // 第一次只修改 StoryIdea.title；第二次挂接新版本并返回界面需要的轻量结果。
      .mockResolvedValueOnce({})
      .mockResolvedValueOnce({
        siId: 20n,
        title: "转换后的新 SI 标题",
        updatedAt: renamedUpdatedAt,
      })
    mockTx.storyIdeaVersion.create.mockResolvedValue({
      siVersionId: 31n,
    })
    mockTx.operationLog.create.mockResolvedValue({})
  })

  it("允许创建编辑修改已转项目 SI 的标题，但不联动项目名称和历史预发快照", async () => {
    const result = await updateStoryIdeaTitle(editorActor, "20", {
      title: "  转换后的新 SI 标题  ",
    })

    expect(mockTx.storyIdea.update).toHaveBeenNthCalledWith(1, {
      where: {
        siId: 20n,
      },
      data: {
        title: "转换后的新 SI 标题",
      },
    })
    expect(mockTx.storyIdeaVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siId: 20n,
        versionNo: 4,
        action: "update",
        editorId: editorActor.userId,
        contentHash: expect.any(String),
        snapshotJson: expect.objectContaining({
          title: "转换后的新 SI 标题",
          coreSynopsis: "核心梗概",
        }),
      }),
    })
    expect(mockTx.storyIdea.update).toHaveBeenNthCalledWith(2, {
      where: {
        siId: 20n,
      },
      data: {
        currentVersionNo: 4,
        latestVersionId: 31n,
      },
      select: {
        siId: true,
        title: true,
        updatedAt: true,
      },
    })
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "si.title.update",
        siId: 20n,
        beforeJson: {
          title: "转项目前的 SI 标题",
        },
        afterJson: {
          title: "转换后的新 SI 标题",
        },
        metadataJson: {
          siStatus: "converted",
        },
      }),
    })
    // SI 改名不会更新 Project，也不会更新 SiPreissue；后者在此事务中根本没有写操作。
    expect(mockTx.project.update).not.toHaveBeenCalled()
    expect(mockTx.siPreissue.update).not.toHaveBeenCalled()
    expect(result).toEqual({
      si: {
        id: "20",
        title: "转换后的新 SI 标题",
        updatedAt: renamedUpdatedAt.toISOString(),
      },
    })
  })

  it("归档 SI 仍保持只读，不能通过标题专用接口改名", async () => {
    mockTx.storyIdea.findUnique.mockResolvedValue({
      ...makeConvertedStoryIdea(),
      status: "archived",
      archivedAt: new Date("2026-08-09T08:00:00.000Z"),
    })

    await expect(
      updateStoryIdeaTitle(editorActor, "20", {
        title: "归档后尝试改名",
      }),
    ).rejects.toMatchObject({
      code: "SI_TITLE_ARCHIVED",
    })

    expect(mockTx.storyIdea.update).not.toHaveBeenCalled()
    expect(mockTx.storyIdeaVersion.create).not.toHaveBeenCalled()
    expect(mockTx.operationLog.create).not.toHaveBeenCalled()
  })

  it("作者不能修改 SI 标题", async () => {
    await expect(
      updateStoryIdeaTitle(authorActor, "20", {
        title: "作者尝试改名",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    })

    expect(mockTx.storyIdea.update).not.toHaveBeenCalled()
    expect(mockTx.storyIdeaVersion.create).not.toHaveBeenCalled()
  })

  it("服务层拒绝超过数据库字段上限的标题", async () => {
    await expect(
      updateStoryIdeaTitle(editorActor, "20", {
        title: "超".repeat(256),
      }),
    ).rejects.toMatchObject({
      code: "SI_TITLE_TOO_LONG",
    })

    // 非法标题在进入事务前被拦截，避免任何业务数据被读取或写入。
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockTx.storyIdea.update).not.toHaveBeenCalled()
  })
})
