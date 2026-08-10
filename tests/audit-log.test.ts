import { beforeEach, describe, expect, it, vi } from "vitest"

import { formatAuditAction, formatAuditChange, formatAuditNote } from "@/lib/audit-log"
import { formatDateTimeToSeconds } from "@/lib/utils"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const { mockOperationLog } = vi.hoisted(() => ({
  // 审计列表测试只需要操作日志模型；其余 Prisma 模型不会在本用例中执行。
  mockOperationLog: {
    findMany: vi.fn(),
    count: vi.fn(),
    groupBy: vi.fn(),
  },
}))

vi.mock("@/server/db/prisma", () => ({
  prisma: {
    operationLog: mockOperationLog,
  },
}))

import { listAuditLogs } from "@/server/modules/admin/admin.service"

const adminActor: ApiCurrentUser = {
  id: "1",
  userId: 1n,
  username: "admin",
  name: "系统管理员",
  role: "admin",
  status: "active",
  preferredLocale: "zh-CN",
  email: "admin@example.test",
}

describe("审计日志展示格式", () => {
  it("把已登记的操作编码转换为中文，并为未知编码保留可追溯原值", () => {
    expect(formatAuditAction("doc.save")).toBe("保存文档")
    expect(formatAuditAction("admin.project.archive")).toBe("归档项目")
    expect(formatAuditAction("future.audit.action")).toBe("future.audit.action")
  })

  it("把本地时间固定格式化到秒", () => {
    // 使用本地时间构造函数，避免测试结果依赖执行机器的时区配置。
    const value = new Date(2026, 7, 6, 9, 29, 1)

    expect(formatDateTimeToSeconds(value)).toBe("2026-08-06 09:29:01")
    expect(formatDateTimeToSeconds(null)).toBe("—")
  })

  it("把变更 JSON 的字段和值转换为中文，并严格限制在 200 个字符内", () => {
    expect(
      formatAuditChange(
        { status: "draft", holderRole: "author", currentStage: "synopsis" },
        { status: "submitted", holderRole: "editor", currentStage: "outline" },
      ),
    ).toBe("状态：草稿；当前持有角色：作者；当前阶段：梗概 → 状态：待审核；当前持有角色：编辑；当前阶段：细纲")

    const truncated = formatAuditChange({ title: "旧".repeat(150) }, { title: "新".repeat(150) })
    expect(truncated).toHaveLength(200)
    expect(truncated.endsWith("...")).toBe(true)
  })

  it("把备注 JSON 递归转换为中文解释", () => {
    expect(
      formatAuditNote({
        submitNote: "请复审",
        sealedDraftId: "88",
        suggestionCount: 2,
        sessionsRevoked: true,
      }),
    ).toBe("提交说明：请复审；封存草稿 ID：88；建议数：2；是否已撤销旧会话：是")
  })
})

describe("listAuditLogs", () => {
  beforeEach(() => {
    vi.clearAllMocks()

    mockOperationLog.findMany.mockResolvedValue([
      {
        logId: 55n,
        actorUserId: 1n,
        actorRole: "admin",
        action: "doc.save",
        entityType: "doc",
        entityId: 11n,
        projectId: null,
        docId: 11n,
        siId: null,
        preissueId: null,
        requestId: null,
        ipAddress: null,
        userAgent: null,
        beforeJson: { status: "draft" },
        afterJson: { status: "saved" },
        metadataJson: {
          submitNote: "请复审",
          suggestionCount: 2,
        },
        createdAt: new Date("2026-08-06T01:29:01.000Z"),
        actor: {
          username: "admin",
          displayName: "系统管理员",
          role: "admin",
        },
        project: null,
        doc: {
          title: "第一章",
        },
        storyIdea: null,
      },
    ])
    mockOperationLog.count.mockResolvedValue(178)
    mockOperationLog.groupBy.mockResolvedValue([
      { action: "admin.project.archive" },
      { action: "doc.save" },
    ])
  })

  it("固定每页 20 条并返回总数、总页数和中文操作类型", async () => {
    const result = await listAuditLogs(adminActor, { page: "3" })

    expect(mockOperationLog.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {},
        orderBy: [{ createdAt: "desc" }, { logId: "desc" }],
        skip: 40,
        take: 20,
      }),
    )
    expect(mockOperationLog.count).toHaveBeenCalledWith({ where: {} })
    expect(result).toMatchObject({
      page: 3,
      pageSize: 20,
      total: 178,
      totalPages: 9,
      actions: [
        { value: "admin.project.archive", label: "归档项目" },
        { value: "doc.save", label: "保存文档" },
      ],
      logs: [
        {
          id: "55",
          action: "doc.save",
          actionLabel: "保存文档",
          target: "Doc：第一章",
          changeSummary: "状态：草稿 → 状态：已保存",
          note: "提交说明：请复审；建议数：2",
        },
      ],
    })
  })
})
