import { beforeEach, describe, expect, it, vi } from "vitest"
import { NextRequest } from "next/server"

const { mockRequireApiCurrentUser, mockUpdateProjectChapterMetadata } = vi.hoisted(() => ({
  mockRequireApiCurrentUser: vi.fn(),
  mockUpdateProjectChapterMetadata: vi.fn(),
}))

vi.mock("@/server/shared/current-user", () => ({
  requireApiCurrentUser: mockRequireApiCurrentUser,
}))

vi.mock("@/server/modules/project/project.service", () => ({
  deleteProjectChapter: vi.fn(),
  updateProjectChapterMetadata: mockUpdateProjectChapterMetadata,
}))

import { PATCH } from "@/app/api/projects/[projectId]/chapters/[docId]/route"

const routeContext = {
  params: Promise.resolve({
    projectId: "100",
    docId: "200",
  }),
}

describe("单章节接口", () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockRequireApiCurrentUser.mockResolvedValue({
      id: "300",
      userId: 300n,
      role: "author",
      username: "author",
      displayName: "作者",
      email: null,
      status: "active",
      passwordResetRequired: false,
      preferredLocale: "zh-CN",
    })
  })

  it("作者提交有效章节号和标题时调用章节信息更新服务", async () => {
    mockUpdateProjectChapterMetadata.mockResolvedValue({
      project: {
        id: "100",
      },
    })
    const request = new NextRequest("https://example.test/api/projects/100/chapters/200", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ title: "第十一章 新标题", chapterNo: 11 }),
    })

    const response = await PATCH(request, routeContext)
    const payload = await response.json()

    expect(response.status).toBe(200)
    expect(mockUpdateProjectChapterMetadata).toHaveBeenCalledWith(
      expect.objectContaining({ role: "author" }),
      "100",
      "200",
      {
        title: "第十一章 新标题",
        chapterNo: 11,
      },
    )
    expect(payload).toMatchObject({
      ok: true,
      project: {
        id: "100",
      },
    })
  })

  it("拒绝零、负数或小数章节号，不进入业务服务", async () => {
    for (const chapterNo of [0, -1, 1.5]) {
      const request = new NextRequest("https://example.test/api/projects/100/chapters/200", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ title: "测试章节", chapterNo }),
      })

      const response = await PATCH(request, routeContext)
      const payload = await response.json()

      expect(response.status).toBe(400)
      expect(payload).toMatchObject({
        ok: false,
        code: "VALIDATION_ERROR",
      })
    }

    expect(mockUpdateProjectChapterMetadata).not.toHaveBeenCalled()
  })
})
