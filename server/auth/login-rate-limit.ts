import "server-only"

type LoginRateLimitContext = {
  accountKey: string
  ipKey: string
}

type AttemptBucket = {
  failedTimestamps: number[]
  blockedUntil: number
}

type LoginRateLimitStore = Map<string, AttemptBucket>

const LOGIN_WINDOW_MS = 10 * 60 * 1000
const LOGIN_BLOCK_MS = 15 * 60 * 1000
const COMBO_MAX_FAILURES = 5
const IP_MAX_FAILURES = 15
const STORE_KEY = "__YX_LOGIN_RATE_LIMIT_STORE__"

function getStore(): LoginRateLimitStore {
  const globalStore = globalThis as typeof globalThis & {
    [STORE_KEY]?: LoginRateLimitStore
  }

  if (!globalStore[STORE_KEY]) {
    globalStore[STORE_KEY] = new Map<string, AttemptBucket>()
  }

  return globalStore[STORE_KEY]
}

function normalizeAccount(account: string) {
  // 登录支持“用户名或邮箱”双口径，因此限流键也要先统一大小写和空白，
  // 避免同一账号因为大小写、首尾空格不同而分裂出多条失败计数。
  return account.trim().toLowerCase()
}

function normalizeIp(input: { forwardedFor?: string | null; realIp?: string | null }) {
  const forwardedIp = input.forwardedFor?.split(",")[0]?.trim()
  const directIp = input.realIp?.trim()

  // 优先取反向代理透传的首个真实来源 IP；
  // 本地开发或代理未配置时再退回到 x-real-ip，最后落到 unknown。
  return forwardedIp || directIp || "unknown"
}

function getBucket(store: LoginRateLimitStore, key: string) {
  const bucket = store.get(key)

  if (bucket) {
    return bucket
  }

  const created: AttemptBucket = {
    failedTimestamps: [],
    blockedUntil: 0,
  }
  store.set(key, created)

  return created
}

function pruneBucket(bucket: AttemptBucket, now: number) {
  const earliestAllowed = now - LOGIN_WINDOW_MS

  bucket.failedTimestamps = bucket.failedTimestamps.filter((timestamp) => timestamp >= earliestAllowed)

  if (bucket.blockedUntil <= now) {
    bucket.blockedUntil = 0
  }
}

function pruneStore(store: LoginRateLimitStore, now: number) {
  for (const [key, bucket] of store.entries()) {
    pruneBucket(bucket, now)

    // 失败窗口和封禁时间都过去后，及时清掉空桶，避免开发进程长时间运行导致内存键持续堆积。
    if (bucket.failedTimestamps.length === 0 && bucket.blockedUntil === 0) {
      store.delete(key)
    }
  }
}

function retryAfterSeconds(blockedUntil: number, now: number) {
  return Math.max(1, Math.ceil((blockedUntil - now) / 1000))
}

export function createLoginRateLimitContext(input: {
  account: string
  forwardedFor?: string | null
  realIp?: string | null
}): LoginRateLimitContext {
  const account = normalizeAccount(input.account)
  const ip = normalizeIp(input)

  return {
    accountKey: `account:${ip}:${account}`,
    ipKey: `ip:${ip}`,
  }
}

export function getLoginRateLimitStatus(context: LoginRateLimitContext) {
  const now = Date.now()
  const store = getStore()
  pruneStore(store, now)

  const comboBlockedUntil = store.get(context.accountKey)?.blockedUntil ?? 0
  const ipBlockedUntil = store.get(context.ipKey)?.blockedUntil ?? 0
  const blockedUntil = Math.max(comboBlockedUntil, ipBlockedUntil)

  if (blockedUntil > now) {
    return {
      limited: true,
      retryAfterSeconds: retryAfterSeconds(blockedUntil, now),
    } as const
  }

  return {
    limited: false,
    retryAfterSeconds: 0,
  } as const
}

export function recordFailedLoginAttempt(context: LoginRateLimitContext) {
  const now = Date.now()
  const store = getStore()
  pruneStore(store, now)

  const comboBucket = getBucket(store, context.accountKey)
  const ipBucket = getBucket(store, context.ipKey)

  comboBucket.failedTimestamps.push(now)
  ipBucket.failedTimestamps.push(now)

  // 组合维度用于拦截“同一 IP 对同一账号连续撞库”，
  // IP 维度用于拦截“单个来源对多个账号大面积试探”。
  if (comboBucket.failedTimestamps.length >= COMBO_MAX_FAILURES) {
    comboBucket.blockedUntil = now + LOGIN_BLOCK_MS
  }

  if (ipBucket.failedTimestamps.length >= IP_MAX_FAILURES) {
    ipBucket.blockedUntil = now + LOGIN_BLOCK_MS
  }
}

export function clearLoginRateLimit(context: LoginRateLimitContext) {
  const store = getStore()

  // 登录成功后立即清空该账号组合与来源 IP 的失败计数，
  // 避免用户在输错几次后即使登录成功，后续正常登录仍被旧失败窗口拖累。
  store.delete(context.accountKey)
  store.delete(context.ipKey)
}

export function resetLoginRateLimitStoreForTests() {
  getStore().clear()
}
