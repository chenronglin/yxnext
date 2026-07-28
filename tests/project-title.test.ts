import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma, mockTx } = vi.hoisted(() => {
  const tx = {
    project: {
      findFirst: vi.fn(),
      update: vi.fn(),
    },
    operationLog: {
      create: vi.fn(),
    },
  }

  return {
    mockTx: tx,
    mockPrisma: {
      $transaction: vi.fn(async (callback: (client: typeof tx) => Promise<unknown>) => callback(tx)),
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { updateProjectTitle } from "@/server/modules/project/project.service"
import type { ApiCurrentUser } from "@/server/shared/current-user"

const NOW = new Date("2026-07-28T08:00:00.000Z")
const UPDATED_AT = new Date("2026-07-28T08:10:00.000Z")

const editorActor: ApiCurrentUser = {
  id: "300",
  userId: 300n,
  username: "editor",
  name: "编辑",
  role: "editor",
  status: "active",
  preferredLocale: "zh-CN",
  email: "editor@example.test",
}

const authorActor: ApiCurrentUser = {
  id: "400",
  userId: 400n,
  username: "author",
  name: "作者",
  role: "author",
  status: "active",
  preferredLocale: "zh-CN",
  email: "author@example.test",
}

function makeProject() {
  return {
    projectId: 100n,
    sourceSiId: 200n,
    title: "旧项目名称",
    editorId: editorActor.userId,
    authorId: authorActor.userId,
    // 即使项目已经完成，编辑仍应能修正项目名称；改名不会改变项目协作状态。
    lifecycleStatus: "completed",
    updatedAt: NOW,
    sourceSi: {
      siId: 200n,
      title: "保持不变的 SI 名称",
      status: "converted",
    },
  }
}

describe("updateProjectTitle", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockTx.project.findFirst.mockResolvedValue(makeProject())
    mockTx.project.update.mockResolvedValue({
      projectId: 100n,
      title: "新项目名称",
      updatedAt: UPDATED_AT,
    })
    mockTx.operationLog.create.mockResolvedValue({})
  })

  it("项目编辑可在项目完成后修改独立项目名称，并保留来源 SI 审计上下文", async () => {
    const result = await updateProjectTitle(editorActor, "100", {
      title: "  新项目名称  ",
    })

    expect(mockTx.project.update).toHaveBeenCalledWith({
      where: {
        projectId: 100n,
      },
      data: {
        title: "新项目名称",
      },
      select: {
        projectId: true,
        title: true,
        updatedAt: true,
      },
    })
    expect(mockTx.operationLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        action: "project.title.update",
        beforeJson: {
          title: "旧项目名称",
        },
        afterJson: {
          title: "新项目名称",
        },
        metadataJson: {
          sourceSiId: "200",
          sourceSiTitle: "保持不变的 SI 名称",
        },
      }),
    })
    expect(result.project).toEqual({
      id: "100",
      projectId: "100",
      title: "新项目名称",
      updatedAt: UPDATED_AT.toISOString(),
    })
  })

  it("作者不能修改项目名称", async () => {
    await expect(
      updateProjectTitle(authorActor, "100", {
        title: "作者尝试改名",
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_EDITOR_ONLY",
    })

    expect(mockTx.project.update).not.toHaveBeenCalled()
    expect(mockTx.operationLog.create).not.toHaveBeenCalled()
  })

  it("空项目名称在进入事务前即被拒绝", async () => {
    await expect(
      updateProjectTitle(editorActor, "100", {
        title: "   ",
      }),
    ).rejects.toMatchObject({
      code: "PROJECT_TITLE_REQUIRED",
    })

    // 非法名称不应读取或更新任何项目数据，也不会产生误导性的审计记录。
    expect(mockPrisma.$transaction).not.toHaveBeenCalled()
    expect(mockTx.project.update).not.toHaveBeenCalled()
    expect(mockTx.operationLog.create).not.toHaveBeenCalled()
  })
})
