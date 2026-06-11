import type { ReactNode } from "react"

interface PageHeaderProps {
  breadcrumb?: string[]
  title?: string
  description?: string
  actions?: ReactNode
  showBorder?: boolean
}

export function PageHeader({ breadcrumb, title, description, actions, showBorder = true }: PageHeaderProps) {
  return (
    <div className={`flex flex-col gap-3 ${showBorder ? "border-b border-border pb-5" : ""}`}>
      {breadcrumb && breadcrumb.length > 0 && (
        <nav className="flex items-center gap-1.5 text-xs text-muted-foreground" aria-label="面包屑">
          {breadcrumb.map((crumb, i) => (
            <span key={i} className="flex items-center gap-1.5">
              {i > 0 && <span className="text-border">/</span>}
              <span className={i === breadcrumb.length - 1 ? "text-foreground" : ""}>{crumb}</span>
            </span>
          ))}
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
