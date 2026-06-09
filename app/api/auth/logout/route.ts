import { NextResponse, type NextRequest } from "next/server"

import { clearSessionCookie, revokeUserSession, SESSION_COOKIE_NAME } from "@/server/auth/session"

// 退出登录需要写数据库撤销 session，因此固定使用 Node.js runtime。
export const runtime = "nodejs"

export async function POST(request: NextRequest) {
  const sessionId = request.cookies.get(SESSION_COOKIE_NAME)?.value

  // 先撤销数据库会话，再清理浏览器 cookie；无 cookie 时也返回成功，保证退出接口具备幂等性。
  await revokeUserSession(sessionId)

  const response = NextResponse.json({ ok: true })
  clearSessionCookie(response)

  return response
}
