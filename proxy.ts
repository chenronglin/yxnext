import { NextResponse, type NextRequest } from "next/server"

const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"])
const SESSION_COOKIE_NAME = "yx_session"
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const SESSION_ID_PATTERN = /^[a-f0-9]{64}$/

function isSessionId(value: string | undefined | null): value is string {
  return Boolean(value && SESSION_ID_PATTERN.test(value))
}

function isSecureSessionCookieEnabled() {
  const configuredValue = process.env.SESSION_COOKIE_SECURE?.trim().toLowerCase()

  // Proxy 负责滑动续期 cookie，必须和登录接口使用同一套 Secure 规则；
  // HTTP 裸端口部署时显式设为 false，HTTPS 生产部署则默认保持 Secure。
  if (configuredValue === "false" || configuredValue === "0" || configuredValue === "no" || configuredValue === "off") {
    return false
  }

  if (configuredValue === "true" || configuredValue === "1" || configuredValue === "yes" || configuredValue === "on") {
    return true
  }

  return process.env.NODE_ENV === "production"
}

function firstHeaderValue(value: string | null) {
  // 反向代理可能按逗号追加多级转发值；这里只取最靠近客户端的第一个值，避免和 Origin 比较时被尾部值干扰。
  return value?.split(",")[0]?.trim() || null
}

function getRequestOrigin(request: NextRequest) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"))
  const forwardedHost = firstHeaderValue(request.headers.get("x-forwarded-host"))
  const host = firstHeaderValue(request.headers.get("host"))
  const protocol = forwardedProto || request.nextUrl.protocol.replace(/:$/, "")
  const effectiveHost = forwardedHost || host

  // Next 在 HOSTNAME=0.0.0.0 启动时会把 request.nextUrl.origin 解析成 0.0.0.0；
  // 浏览器真实请求的 Origin 却是公网 IP 或域名。这里用请求头还原外部访问地址，兼容裸端口和 Nginx/负载均衡部署。
  if (!effectiveHost) {
    return request.nextUrl.origin
  }

  try {
    return new URL(`${protocol}://${effectiveHost}`).origin
  } catch {
    // 如果 Host 头异常，回退到 Next 的解析结果，让后续同源判断继续按保守路径处理。
    return request.nextUrl.origin
  }
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
    return new URL(origin).origin === getRequestOrigin(request)
  } catch {
    return false
  }
}

function applySecurityHeaders(response: NextResponse) {
  const scriptSource =
    process.env.NODE_ENV === "development"
      ? "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com"
      : "script-src 'self' 'unsafe-inline' https://va.vercel-scripts.com"
  const connectSource =
    process.env.NODE_ENV === "development"
      ? "connect-src 'self' ws: wss: https://vitals.vercel-insights.com"
      : "connect-src 'self' https://vitals.vercel-insights.com"

  response.headers.set("X-Content-Type-Options", "nosniff")
  response.headers.set("X-DNS-Prefetch-Control", "off")
  response.headers.set("X-Frame-Options", "DENY")
  response.headers.set("Referrer-Policy", "strict-origin-when-cross-origin")
  response.headers.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()")
  response.headers.set("Cross-Origin-Opener-Policy", "same-origin")
  response.headers.set(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      // Next.js 页面和当前富文本编辑器仍需要内联样式；这里先做不破坏业务的 CSP 收口，
      // 后续如要完全移除 unsafe-inline，应改成 nonce 方案并逐页验证。
      scriptSource,
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      connectSource,
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
    ].join("; "),
  )
}

function shouldApplyHsts(request: NextRequest) {
  const forwardedProto = firstHeaderValue(request.headers.get("x-forwarded-proto"))

  // HSTS 只在浏览器真实通过 HTTPS 访问时下发，避免本地 HTTP 或裸 IP 调试被浏览器强制升级锁死。
  return forwardedProto === "https" || request.nextUrl.protocol === "https:"
}

export function proxy(request: NextRequest) {
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

  if (shouldApplyHsts(request)) {
    response.headers.set("Strict-Transport-Security", "max-age=15552000; includeSubDomains")
  }

  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value

  if (isSessionId(sessionId)) {
    // 浏览器 cookie 的滑动续期只能在响应里写；数据库过期时间由 session 读取逻辑按阈值延长。
    response.cookies.set({
      name: SESSION_COOKIE_NAME,
      value: sessionId,
      httpOnly: true,
      sameSite: "lax",
      secure: isSecureSessionCookieEnabled(),
      path: "/",
      maxAge: SESSION_MAX_AGE_SECONDS,
    })
  }

  return response
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|icon.svg|icon-light-32x32.png|icon-dark-32x32.png|apple-icon.png).*)"],
}
