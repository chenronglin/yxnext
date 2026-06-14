import { NextResponse, type NextRequest } from "next/server"

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const SESSION_COOKIE_NAME = "yx_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/

function isSessionId(value: string | undefined | null): value is string {
  return Boolean(value && SESSION_ID_PATTERN.test(value))
}

function isSameOriginMutation(request: NextRequest) {
  if (!request.nextUrl.pathname.startsWith("/api/") || !MUTATING_METHODS.has(request.method)) {
    return true
  }

  const origin = request.headers.get("origin")

  // 定时任务、服务端脚本或同源表单可能没有 Origin；这类请求继续交给鉴权和业务密钥校验。
  if (!origin) {
    return true
  }

  try {
    return new URL(origin).origin === request.nextUrl.origin
  } catch {
    return false
  }
}

function applySecurityHeaders(response: NextResponse) {
  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
}

export function middleware(request: NextRequest) {
  if (!isSameOriginMutation(request)) {
    return NextResponse.json(
      {
        ok: false,
        code: "ORIGIN_FORBIDDEN",
        message: "请求来源不被允许",
      },
      { status: 403 },
    )
  }

  const requestHeaders = new Headers(request.headers)
  requestHeaders.set("x-current-path", request.nextUrl.pathname)

  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  })

  applySecurityHeaders(response)

  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (isSessionId(sessionId)) {
    // 浏览器 cookie 的滑动续期只能在响应里写；数据库过期时间由 session 读取逻辑按阈值延长。
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-light-32x32.png|icon-dark-32x32.png|apple-icon.png).*)"],
}
