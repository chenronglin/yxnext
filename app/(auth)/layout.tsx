import type { ReactNode } from "react"
import { BookOpenText } from "lucide-react"

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BookOpenText className="size-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">阅享</h1>
              <p className="text-sm text-muted-foreground">小说协作管理与审稿交流平台</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        阅享 · 从选题创意到成稿交付的协作管理平台
      </footer>
    </div>
  )
}
