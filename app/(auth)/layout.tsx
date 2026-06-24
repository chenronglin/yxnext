import type { ReactNode } from "react"
import { BookOpenText } from "lucide-react"

import { LanguageSwitcher } from "@/components/i18n/language-switcher"
import { getServerT } from "@/lib/i18n/server"

export default async function AuthLayout({ children }: { children: ReactNode }) {
  const t = await getServerT()

  return (
    <div className="flex min-h-screen flex-col bg-muted">
      <div className="flex justify-end px-4 pt-4">
        <LanguageSwitcher />
      </div>
      <div className="flex flex-1 items-center justify-center px-4 py-10">
        <div className="w-full max-w-md">
          <div className="mb-8 flex flex-col items-center gap-3 text-center">
            <div className="flex size-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
              <BookOpenText className="size-7" />
            </div>
            <div>
              <h1 className="text-xl font-semibold tracking-tight text-foreground">{t("brand.name")}</h1>
              <p className="text-sm text-muted-foreground">{t("brand.tagline")}</p>
            </div>
          </div>
          {children}
        </div>
      </div>
      <footer className="py-6 text-center text-xs text-muted-foreground">
        {t("brand.footer")}
      </footer>
    </div>
  )
}
