import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockTx, mockPrisma } = vi.hoisted(() => {
  const tx = {
    operationLog: {
      findMany: vi.fn(),
      count: vi.fn(),
      groupBy: vi.fn(),
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

import { listOpenAuditLogs } from "@/server/modules/open/open-audit.service"

const baseInput = {
  page: 1,
  pageSize: 20,
  projectId: null,
  docId: null,
  actorId: null,
  operator: null,
  action: null,
  startAt: null,
  endAt: null,
  updatedSince: null,
}

const docLog = {
  logId: 501n,
  actorUserId: 30n,
  actorRole: "editor",
  action: "doc.return",
  entityType: "doc",
  entityId: 200n,
  projectId: 100n,
  docId: 200n,
  beforeJson: { status: "submitted" },
  afterJson: { status: "rejected" },
  metadataJson: { returnNote: "补充细节" },
  createdAt: new Date("2026-08-08T08:30:00.000Z"),
  actor: {
    username: "editor",
    displayName: "编辑甲",
    role: "editor",
  },
  project: {
    title: "项目甲",
  },
  doc: {
    title: "第一章",
    stageCode: "chapter",
  },
}

describe("Open Audit Logs 查询服务", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.$transaction.mockImplementation(async (callback: (tx: typeof mockTx) => unknown) => callback(mockTx))
    mockTx.operationLog.findMany.mockResolvedValue([docLog])
    mockTx.operationLog.count.mockResolvedValue(1)
    mockTx.operationLog.groupBy.mockResolvedValue([
      { action: "doc.approve" },
      { action: "doc.return" },
      { action: "doc.save" },
      { action: "doc.submit" },
    ])
  })

  it("默认只返回项目关联日志并映射文档动作、业务对象和所属阶段", async () => {
    const result = await listOpenAuditLogs(baseInput)

    expect(mockTx.operationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { projectId: { not: null } },
        orderBy: [{ createdAt: "desc" }, { logId: "desc" }],
        skip: 0,
        take: 20,
      }),
    )
    expect(result).toMatchObject({
      page: 1,
      pageSize: 20,
      total: 1,
      totalPages: 1,
      actions: [
        { value: "doc.approve", label: "通过文档审核" },
        { value: "doc.return", label: "退回文档修改" },
        { value: "doc.save", label: "保存文档" },
        { value: "doc.submit", label: "提交文档审核" },
      ],
      logs: [
        {
          id: "501",
          time: "2026-08-08T08:30:00.000Z",
          operator: "编辑甲",
          operatorId: "30",
          role: "editor",
          action: "doc.return",
          actionLabel: "退回文档修改",
          target: "项目：项目甲 · Doc：第一章",
          entityType: "doc",
          entityId: "200",
          projectId: "100",
          projectTitle: "项目甲",
          docId: "200",
          docTitle: "第一章",
          stage: "chapter",
        },
      ],
    })
  })

  it("组合全部筛选条件，并在增量模式按时间和日志 ID 升序分页", async () => {
    const startAt = new Date("2026-08-01T00:00:00.000Z")
    const endAt = new Date("2026-08-10T23:59:59.999Z")
    const updatedSince = new Date("2026-08-05T00:00:00.000Z")

    await listOpenAuditLogs({
      page: 2,
      pageSize: 50,
      projectId: 100n,
      docId: 200n,
      actorId: 30n,
      operator: "编辑甲",
      action: "doc.return",
      startAt,
      endAt,
      updatedSince,
    })

    expect(mockTx.operationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          projectId: 100n,
          docId: 200n,
          actorUserId: 30n,
          action: "doc.return",
          actor: {
            OR: [
              { displayName: { contains: "编辑甲" } },
              { username: { contains: "编辑甲" } },
            ],
          },
          createdAt: {
            gt: updatedSince,
            gte: startAt,
            lte: endAt,
          },
        },
        orderBy: [{ createdAt: "asc" }, { logId: "asc" }],
        skip: 50,
        take: 50,
      }),
    )
  })

  it("项目级日志优先使用历史阶段快照，不能确定时明确返回 null", async () => {
    mockTx.operationLog.findMany.mockResolvedValueOnce([
      {
        ...docLog,
        logId: 502n,
        actorUserId: null,
        actorRole: "admin",
        action: "project.complete",
        entityType: "project",
        entityId: 100n,
        docId: null,
        beforeJson: { currentStage: "release" },
        afterJson: { currentStage: "completed" },
        metadataJson: null,
        actor: null,
        doc: null,
      },
      {
        ...docLog,
        logId: 503n,
        action: "project.title.update",
        entityType: "project",
        entityId: 100n,
        docId: null,
        beforeJson: { title: "旧标题" },
        afterJson: { title: "新标题" },
        metadataJson: null,
        doc: null,
      },
    ])

    const result = await listOpenAuditLogs(baseInput)

    expect(result.logs[0]).toMatchObject({
      operator: "已删除用户",
      operatorId: null,
      role: "admin",
      target: "项目：项目甲",
      stage: "release",
    })
    expect(result.logs[1]).toMatchObject({
      action: "project.title.update",
      stage: null,
    })
  })
})
