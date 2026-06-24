import { describe, expect, it } from "vitest"
import { NextRequest } from "next/server"

import { ApiError, fail } from "@/server/shared/api-response"

describe("api-response i18n", () => {
  it("按 yx_locale Cookie 返回英文 API 错误", async () => {
    const request = new NextRequest("https://example.test/api/account/profile", {
      headers: {
        cookie: "yx_locale=en-US",
      },
    })

    const response = fail(
      new ApiError({
        status: 401,
        code: "UNAUTHORIZED",
        message: "未登录或登录已过期",
      }),
      request,
    )
    const payload = await response.json()

    expect(payload).toMatchObject({
      ok: false,
      code: "UNAUTHORIZED",
      message: "Not logged in or session expired",
    })
  })
})
