import type { ReactNode } from "react"
import Link from "next/link"

type BreadcrumbItem =
  | string
  | {
      label: string
      href?: string
    }

interface PageHeaderProps {
  breadcrumb?: BreadcrumbItem[]
  breadcrumbAriaLabel?: string
  title?: string
  description?: string
  actions?: ReactNode
  showBorder?: boolean
}

export function PageHeader({
  breadcrumb,
  breadcrumbAriaLabel = "Breadcrumbs",
  title,
  description,
  actions,
  showBorder = true,
}: PageHeaderProps) {
  // 面包屑 aria 文案由调用页传入已翻译内容；默认值不含中文，避免英文界面 DOM 中残留中文辅助文本。
  return (
    <div className={`flex flex-col gap-3 ${showBorder ? "border-b border-border pb-5" : ""}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label={breadcrumbAriaLabel}>
          {breadcrumb.map((crumb, i) => {
            const item = typeof crumb === "string" ? { label: crumb } : crumb
            const isLast = i === breadcrumb.length - 1

            return (
              <span key={`${i}-${item.label}`} className="flex items-center gap-1.5">
                {i > 0 && <span className="text-border">/</span>}
                {item.href && !isLast ? (
                  <Link className="rounded-sm underline-offset-4 hover:text-foreground hover:underline" href={item.href}>
                    {item.label}
                  </Link>
                ) : (
                  <span className={isLast ? "text-foreground" : ""}>{item.label}</span>
                )}
              </span>
            )
          })}
        </nav>
      )}
      {(title || description || actions) && (
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          {(title || description) && (
            <div className="space-y-1">
              {title && <h1 className="text-balance text-xl font-semibold tracking-tight text-foreground">{title}</h1>}
              {description && <p className="text-pretty text-sm text-muted-foreground">{description}</p>}
            </div>
          )}
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
    </div>
  )
}
