import { afterEach, describe, expect, it, vi } from "vitest"

import {
  clearLoginRateLimit,
  createLoginRateLimitContext,
  createPublicRateLimitContext,
  getLoginRateLimitStatus,
  getPublicRateLimitStatus,
  PUBLIC_REGISTER_RATE_LIMIT,
  recordFailedLoginAttempt,
  recordPublicRateLimitHit,
  resetLoginRateLimitStoreForTests,
} from "@/server/auth/login-rate-limit"

describe("login-rate-limit", () => {
  afterEach(() => {
    vi.useRealTimers()
    resetLoginRateLimitStoreForTests()
  })

  it("同一 IP + 同一账号连续失败达到阈值后会被封禁", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"))

    const context = createLoginRateLimitContext({
      account: "Writer_A",
      forwardedFor: "127.0.0.1",
    })

    // 组合维度命中 5 次失败后，应该直接进入封禁窗口。
    for (let index = 0; index < 5; index += 1) {
      recordFailedLoginAttempt(context)
    }

    expect(getLoginRateLimitStatus(context)).toEqual({
      limited: true,
      retryAfterSeconds: 900,
    })
  })

  it("登录成功后会清空限流状态，避免旧失败记录继续阻断正常登录", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"))

    const context = createLoginRateLimitContext({
      account: "writer_a",
      forwardedFor: "127.0.0.1",
    })

    for (let index = 0; index < 4; index += 1) {
      recordFailedLoginAttempt(context)
    }

    clearLoginRateLimit(context)

    expect(getLoginRateLimitStatus(context)).toEqual({
      limited: false,
      retryAfterSeconds: 0,
    })
  })

  it("公开注册入口按来源 IP 达到窗口上限后会被限流", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-06-10T10:00:00.000Z"))

    const context = createPublicRateLimitContext({
      scope: "register",
      forwardedFor: "203.0.113.10",
    })

    for (let index = 0; index < PUBLIC_REGISTER_RATE_LIMIT.maxHits; index += 1) {
      recordPublicRateLimitHit(context)
    }

    expect(getPublicRateLimitStatus(context, PUBLIC_REGISTER_RATE_LIMIT)).toEqual({
      limited: true,
      retryAfterSeconds: 1800,
    })
  })
})
