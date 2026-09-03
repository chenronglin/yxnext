import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    siMainType: {
      findUnique: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
    },
    siMetadataOption: {
      findFirst: vi.fn(),
      upsert: vi.fn(),
    },
    user: {
      findMany: vi.fn(),
    },
    editorAuthorBinding: {
      findMany: vi.fn(),
    },
    storyIdea: {
      create: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
    },
    storyIdeaFitAuthor: {
      deleteMany: vi.fn(),
      createMany: vi.fn(),
    },
    storyIdeaVersion: {
      create: vi.fn(),
      findFirst: vi.fn(),
    },
    siPreissue: {
      findMany: vi.fn(),
      create: vi.fn(),
    },
    notification: {
      createMany: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      storyIdea: {
        findUnique: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import {
  createStoryIdea,
  getStoryIdea,
  prepublishStoryIdea,
  rollbackStoryIdeaVersion,
} from "@/server/modules/si/si.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const editorActor: ApiCurrentUser = {
  id: "100",
  userId: 100n,
  username: "editor",
  name: "编辑",
  role: "editor",
  status: "active",
  preferredLocale: "zh-CN",
  email: "editor@example.test",
}

const author = {
  userId: 200n,
  username: "author",
  displayName: "作者",
}
const mainType = { mainTypeId: 1n, code: "urban", name: "都市", isActive: true }
const siType = {
  optionId: 2n,
  category: "si_type",
  code: "original",
  name: "原创",
  sortOrder: 1,
  isActive: true,
}
const difficulty = {
  optionId: 3n,
  category: "creative_difficulty",
  code: "medium",
  name: "中等",
  sortOrder: 1,
  isActive: true,
}
const createdAt = new Date("2026-09-02T08:00:00.000Z")

function makeStoryIdea(overrides: Record<string, unknown> = {}) {
  return {
    siId: 10n,
    title: "测试 SI",
    mainTypeId: mainType.mainTypeId,
    siTypeId: siType.optionId,
    creativeDifficultyId: difficulty.optionId,
    referenceBookTitle: "参考小说",
    referenceBookUrl: "https://example.com/book",
    trope: "身份反转",
    fitAuthorNote: null,
    remarks: null,
    freshTwist: "新鲜点",
    coreSynopsis: "核心故事梗概",
    creatorEditorId: editorActor.userId,
    status: "draft",
    currentVersionNo: 1,
    latestVersionId: 11n,
    createdAt,
    updatedAt: createdAt,
    archivedAt: null,
    mainType,
    siType,
    creativeDifficulty: difficulty,
    creatorEditor: {
      userId: editorActor.userId,
      username: editorActor.username,
      displayName: editorActor.name,
    },
    fitAuthors: [],
    preissues: [],
    versions: [],
    ...overrides,
  }
}

describe("SI 扩展字段", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTx.siMainType.findUnique.mockResolvedValue(mainType)
    mockTx.siMetadataOption.findFirst.mockImplementation(
      ({ where }: { where: { category: string } }) =>
        Promise.resolve(where.category === "si_type" ? siType : difficulty),
    )
    mockTx.storyIdea.create.mockResolvedValue(makeStoryIdea())
    mockTx.storyIdeaFitAuthor.deleteMany.mockResolvedValue({ count: 0 })
    mockTx.storyIdeaVersion.create.mockResolvedValue({ siVersionId: 11n })
    mockTx.storyIdea.update.mockResolvedValue(makeStoryIdea())
    mockTx.operationLog.create.mockResolvedValue({})
    mockPrisma.storyIdea.findUnique.mockResolvedValue(makeStoryIdea())
  })

  it("创建时保存四个扩展字段，并把字典编码和名称写入版本快照", async () => {
    const result = await createStoryIdea(editorActor, {
      title: "测试 SI",
      mainTypeId: "1",
      siTypeId: "2",
      creativeDifficultyId: "3",
      referenceBookTitle: "  参考小说  ",
      referenceBookUrl: "  https://example.com/book  ",
      coreSynopsis: "核心故事梗概",
    })

    expect(mockTx.storyIdea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siTypeId: 2n,
        creativeDifficultyId: 3n,
        referenceBookTitle: "参考小说",
        referenceBookUrl: "https://example.com/book",
      }),
    })
    expect(mockTx.storyIdeaVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        snapshotJson: expect.objectContaining({
          siTypeId: "2",
          siTypeCode: "original",
          siType: "原创",
          creativeDifficultyId: "3",
          creativeDifficultyCode: "medium",
          creativeDifficulty: "中等",
          referenceBookTitle: "参考小说",
          referenceBookUrl: "https://example.com/book",
        }),
      }),
    })
    expect(result.si).toEqual(
      expect.objectContaining({
        siType: "原创",
        creativeDifficulty: "中等",
        referenceBookTitle: "参考小说",
        referenceBookUrl: "https://example.com/book",
      }),
    )
  })

  it("SI 类型和创作难度可手工输入，并自动留存为内部关联记录", async () => {
    mockTx.siMetadataOption.findFirst.mockResolvedValue(null)
    mockTx.siMetadataOption.upsert.mockImplementation(
      ({ create }: { create: Record<string, unknown> }) =>
        Promise.resolve({
          optionId: create.category === "si_type" ? 2n : 3n,
          sortOrder: 0,
          ...create,
        }),
    )

    await createStoryIdea(editorActor, {
      title: "手工输入测试",
      mainTypeId: "1",
      siType: "  商业定制  ",
      creativeDifficulty: "  高难度  ",
      coreSynopsis: "核心故事梗概",
    })

    expect(mockTx.siMetadataOption.upsert).toHaveBeenCalledTimes(2)
    expect(mockTx.siMetadataOption.upsert).toHaveBeenCalledWith({
      where: {
        category_code: {
          category: "si_type",
          code: expect.stringMatching(/^manual-[a-f0-9]{40}$/),
        },
      },
      update: { name: "商业定制" },
      create: {
        category: "si_type",
        code: expect.stringMatching(/^manual-[a-f0-9]{40}$/),
        name: "商业定制",
        isActive: true,
      },
    })
    expect(mockTx.storyIdea.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siTypeId: 2n,
        creativeDifficultyId: 3n,
      }),
    })
  })

  it("预发布快照固定保存当时的扩展字段名称，字典后续停用不影响历史展示", async () => {
    const storyIdea = makeStoryIdea()
    mockTx.storyIdea.findUnique.mockResolvedValue(storyIdea)
    mockTx.user.findMany.mockResolvedValue([{ userId: author.userId }])
    mockTx.editorAuthorBinding.findMany.mockResolvedValue([{ authorId: author.userId }])
    mockTx.siPreissue.findMany.mockResolvedValue([])
    mockTx.siPreissue.create.mockImplementation(({ data }: { data: Record<string, unknown> }) =>
      Promise.resolve({
        preissueId: 20n,
        siId: 10n,
        siVersionId: 11n,
        editorId: editorActor.userId,
        authorId: author.userId,
        preissueNote: null,
        siSnapshotJson: data.siSnapshotJson,
        status: "preissued",
        projectId: null,
        preissuedAt: createdAt,
        recalledAt: null,
        convertedAt: null,
        storyIdea,
        editor: storyIdea.creatorEditor,
        author,
        project: null,
      }),
    )
    mockTx.notification.createMany.mockResolvedValue({ count: 1 })

    await prepublishStoryIdea(editorActor, "10", { authorIds: ["200"] })

    expect(mockTx.siPreissue.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        siSnapshotJson: expect.objectContaining({
          siTypeCode: "original",
          siType: "原创",
          creativeDifficultyCode: "medium",
          creativeDifficulty: "中等",
          referenceBookTitle: "参考小说",
          referenceBookUrl: "https://example.com/book",
        }),
      }),
      include: expect.any(Object),
    })
  })

  it("回滚迁移前旧快照时把缺失扩展字段兼容为空", async () => {
    const existing = makeStoryIdea({ currentVersionNo: 2, latestVersionId: 12n })
    mockTx.storyIdea.findUnique.mockResolvedValue(existing)
    mockTx.storyIdeaVersion.findFirst.mockResolvedValue({
      siVersionId: 11n,
      versionNo: 1,
      snapshotJson: {
        title: "旧版 SI",
        mainTypeId: "1",
        mainType: "都市",
        trope: "旧梗",
        fitAuthorIds: [],
        coreSynopsis: "旧版核心梗概",
      },
    })
    mockTx.storyIdea.update
      .mockResolvedValueOnce(
        makeStoryIdea({
          title: "旧版 SI",
          siTypeId: null,
          creativeDifficultyId: null,
          referenceBookTitle: null,
          referenceBookUrl: null,
          siType: null,
          creativeDifficulty: null,
        }),
      )
      .mockResolvedValueOnce({})
    mockTx.storyIdeaVersion.create.mockResolvedValue({ siVersionId: 13n })

    await rollbackStoryIdeaVersion(editorActor, "10", "11")

    expect(mockTx.storyIdea.update).toHaveBeenNthCalledWith(1, {
      where: { siId: 10n },
      data: expect.objectContaining({
        siTypeId: null,
        creativeDifficultyId: null,
        referenceBookTitle: null,
        referenceBookUrl: null,
      }),
    })
    expect(mockTx.storyIdeaVersion.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "rollback",
        snapshotJson: expect.objectContaining({
          siTypeId: null,
          siType: null,
          creativeDifficultyId: null,
          creativeDifficulty: null,
          referenceBookTitle: null,
          referenceBookUrl: null,
        }),
      }),
    })
  })

  it("读取迁移前版本快照时扩展字段显示为空，不抛出异常", async () => {
    mockPrisma.storyIdea.findUnique.mockResolvedValue(
      makeStoryIdea({
        versions: [
          {
            siVersionId: 9n,
            versionNo: 1,
            action: "create",
            snapshotJson: { title: "旧版 SI", mainType: "都市", coreSynopsis: "旧梗概" },
            createdAt,
            editor: {
              username: editorActor.username,
              displayName: editorActor.name,
            },
          },
        ],
      }),
    )

    const result = await getStoryIdea(editorActor, "10")

    expect(result.si.versions[0]).toEqual(
      expect.objectContaining({
        siType: "",
        creativeDifficulty: "",
        referenceBookTitle: "",
        referenceBookUrl: "",
      }),
    )
  })

  it("拒绝非 HTTP/HTTPS 参考书籍链接，并且不进入事务", async () => {
    await expect(
      createStoryIdea(editorActor, {
        title: "非法链接 SI",
        mainTypeId: "1",
        referenceBookUrl: "javascript:alert(1)",
        coreSynopsis: "核心故事梗概",
      }),
    ).rejects.toMatchObject({ code: "REFERENCE_BOOK_URL_INVALID" })

    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
  })

  it("新建 SI 时拒绝已停用配置项", async () => {
    mockTx.siMetadataOption.findFirst.mockImplementation(
      ({ where }: { where: { category: string } }) =>
        Promise.resolve(where.category === "si_type" ? { ...siType, isActive: false } : difficulty),
    )

    await expect(
      createStoryIdea(editorActor, {
        title: "停用配置测试",
        mainTypeId: "1",
        siTypeId: "2",
        creativeDifficultyId: "3",
        coreSynopsis: "核心故事梗概",
      }),
    ).rejects.toMatchObject({ code: "SI_METADATA_OPTION_INACTIVE" })

    expect(mockTx.storyIdea.create).not.toHaveBeenCalled()
  })
})
