import { beforeEach, describe, expect, it, vi } from "vitest"

const { mockPrisma } = vi.hoisted(() => {
  return {
    mockPrisma: {
      project: {
        count: vi.fn(),
      },
      stagePlanDefault: {
        findMany: vi.fn(),
      },
      projectStagePlan: {
        findMany: vi.fn(),
        update: vi.fn(),
      },
      todoItem: {
        updateMany: vi.fn(),
        upsert: vi.fn(),
      },
      notification: {
        create: vi.fn(),
      },
    },
  }
})

vi.mock("@/server/db/prisma", () => ({
  prisma: mockPrisma,
}))

import { syncActiveProjectTimelineStatuses } from "@/server/shared/project-stage-timeline"

describe("project-stage-timeline", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockPrisma.project.count.mockResolvedValue(0)
    mockPrisma.stagePlanDefault.findMany.mockResolvedValue([])
    mockPrisma.projectStagePlan.findMany.mockResolvedValue([])
  })

  it("没有活动项目时直接跳过阶段计划同步，治理列表应能展示空项目状态", async () => {
    await syncActiveProjectTimelineStatuses()

    expect(mockPrisma.project.count).toHaveBeenCalledWith({
      where: {
        lifecycleStatus: "active",
      },
    })
    expect(mockPrisma.stagePlanDefault.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.projectStagePlan.findMany).not.toHaveBeenCalled()
    expect(mockPrisma.projectStagePlan.update).not.toHaveBeenCalled()
  })
})

