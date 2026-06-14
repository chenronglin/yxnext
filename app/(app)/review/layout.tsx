import type { ReactNode } from "react"

export default async function ReviewLayout({ children }: { children: ReactNode }) {
  // /review 现在只作为历史链接兼容层，具体可见性由重定向页按 Doc 归属判断。
  return children
}
