import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    $queryRaw: vi.fn(),
    project: {
      count: vi.fn(),
      findMany: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      $transaction: vi.fn(),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { listOpenProjects } from "@/server/modules/open/open-project.service"

const projectFixture = {
  projectId: 10n,
  title: "项目甲",
  authorId: 20n,
  editorId: 30n,
  author: { username: "author", displayName: "作者甲" },
  editor: { username: "editor", displayName: "编辑甲" },
  sourceSi: { mainType: { name: "狼人文" } },
  currentStage: "chapter",
  lifecycleStatus: "active",
  createdAt: new Date("2026-07-01T00:00:00.000Z"),
  updatedAt: new Date("2026-07-20T00:00:00.000Z"),
  stagePlans: [
    {
      stageCode: "chapter",
      planDays: 30,
      startedAt: new Date("2026-07-10T00:00:00.000Z"),
      dueAt: new Date("2026-08-09T00:00:00.000Z"),
      completedAt: null,
      timelineStatus: "in_progress",
    },
  ],
  docs: [
    {
      docId: 100n,
      docType: "chapter",
      chapterNo: 1,
      sortOrder: 5,
      title: "第一章",
      status: "approved",
      holderRole: "none",
      currentWordCount: 1200,
      lastHandoffNote: "已通过",
      lastActor: { username: "editor", displayName: "编辑甲" },
      lastActionAt: new Date("2026-08-01T10:00:00.000Z"),
      updatedAt: new Date("2026-08-01T10:00:00.000Z"),
    },
    {
      docId: 101n,
      docType: "chapter",
      chapterNo: null,
      sortOrder: 2,
      title: "第二章",
      status: "rejected",
      holderRole: "author",
      currentWordCount: 900,
      lastHandoffNote: null,
      lastActor: null,
      lastActionAt: null,
      updatedAt: new Date("2026-08-02T10:30:00.000Z"),
    },
    {
      docId: 102n,
      docType: "outline",
      chapterNo: null,
      sortOrder: 0,
      title: "细纲",
      status: "approved",
      holderRole: "none",
      currentWordCount: 300,
      lastHandoffNote: null,
      lastActor: null,
      lastActionAt: null,
      updatedAt: new Date("2026-07-05T00:00:00.000Z"),
    },
  ],
}

describe("Open Projects 查询服务", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // 用回调式事务模拟同一快照内的原始同步查询、计数和详情查询。
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx))
    mockTx.$queryRaw.mockResolvedValue([
      {
        projectId: 10n,
        syncUpdatedAt: new Date("2026-08-02T10:30:00.000Z"),
      },
    ])
    mockTx.project.count.mockResolvedValue(1)
    mockTx.project.findMany.mockResolvedValue([projectFixture])
  })

  it("默认省略章节明细，但仍根据有效章节计算统计和同步时间", async () => {
    const result = await listOpenProjects({
      page: 1,
      pageSize: 20,
      updatedSince: null,
      includeChapters: false,
    })

    expect(result).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      items: [
        {
          id: "10",
          title: "项目甲",
          mainType: "狼人文",
          stage: "chapter",
          lifecycle: "active",
          updatedAt: "2026-07-20T00:00:00.000Z",
          syncUpdatedAt: "2026-08-02T10:30:00.000Z",
          totalChapters: 2,
          approvedChapters: 1,
        },
      ],
    })
    expect(result.items[0]).not.toHaveProperty("chapters")
  })

  it("请求章节时沿用管理员接口的章序、状态和最近操作字段语义", async () => {
    const result = await listOpenProjects({
      page: 1,
      pageSize: 20,
      updatedSince: new Date("2026-08-01T00:00:00.000Z"),
      includeChapters: true,
    })

    expect(result.items[0]?.chapters).toEqual([
      expect.objectContaining({
        id: "100",
        order: 1,
        status: "approved",
        lastOperator: "编辑甲",
        lastOperatedAt: "2026-08-01T10:00:00.000Z",
      }),
      expect.objectContaining({
        id: "101",
        order: 2,
        status: "returned",
        lastOperator: "系统",
        lastOperatedAt: "2026-08-02T10:30:00.000Z",
      }),
    ])
    expect(mockTx.project.count).toHaveBeenCalledWith({
      where: {
        OR: [
          { updatedAt: { gt: new Date("2026-08-01T00:00:00.000Z") } },
          { stagePlans: { some: { updatedAt: { gt: new Date("2026-08-01T00:00:00.000Z") } } } },
          { docs: { some: { isDeleted: false, updatedAt: { gt: new Date("2026-08-01T00:00:00.000Z") } } } },
        ],
      },
    })
  })
})
