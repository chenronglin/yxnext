"use client"

import { useEffect, useMemo, useState } from "react"
import Link from "next/link"

import { PageHeader } from "@/components/page-header"
import { StatusBadge } from "@/components/status-badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { fetchJson } from "@/lib/api"
import { formatDateOnly } from "@/lib/utils"
import { PRERELEASE_STATUS_LABEL_KEYS, PRERELEASE_STATUS_TONE, type PrereleaseRecord } from "@/types/si"
import { useT } from "@/hooks/use-t"
import { ExternalLink, Eye, Search } from "lucide-react"

type AuthorStatus = "active" | "converted"

type PreissueListResponse = {
  records: PrereleaseRecord[]
}

export default function MySiPage() {
  const t = useT()
  const [records, setRecords] = useState<PrereleaseRecord[]>([])
  const [loading, setLoading] = useState(true)
  const [keyword, setKeyword] = useState("")
  const [status, setStatus] = useState<AuthorStatus | "all">("all")
  const [errorMessage, setErrorMessage] = useState<string | null>(null)

  useEffect(() => {
    // 作者端直接读取预发记录列表接口；服务层已保证收回记录不会出现在这里。
    setLoading(true)

    void fetchJson<PreissueListResponse>("/api/si-prepublish")
      .then((response) => {
        setRecords(response.records)
      })
      .catch((error) => {
        setErrorMessage(error instanceof Error ? error.message : t("mySi.loadFailed"))
      })
      .finally(() => {
        setLoading(false)
      })
  }, [t])

  const filtered = useMemo(() => {
    return records.filter((record) => {
      if (keyword && !record.title.includes(keyword) && !record.trope.includes(keyword)) return false
      if (status !== "all" && record.status !== status) return false
      return true
    })
  }, [records, keyword, status])

  return (
    <div className="flex flex-col gap-6">
      <PageHeader
        breadcrumb={[t("mySi.title")]}
        breadcrumbAriaLabel={t("common.breadcrumbs")}
        title={t("mySi.title")}
        description={t("mySi.description")}
      />

      {errorMessage && (
        <div className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
          {errorMessage}
        </div>
      )}

      <Card className="flex flex-col gap-3 p-4 lg:flex-row lg:items-center">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={keyword}
            onChange={(event) => setKeyword(event.target.value)}
            placeholder={t("mySi.searchPlaceholder")}
            className="pl-9"
          />
        </div>
        <Select value={status} onValueChange={(value) => setStatus(value as AuthorStatus | "all")}>
          <SelectTrigger className="w-40">
            <SelectValue>
              {status === "all" ? t("mySi.allStatuses") : t(PRERELEASE_STATUS_LABEL_KEYS[status])}
            </SelectValue>
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("mySi.allStatuses")}</SelectItem>
            <SelectItem value="active">{t(PRERELEASE_STATUS_LABEL_KEYS.active)}</SelectItem>
            <SelectItem value="converted">{t(PRERELEASE_STATUS_LABEL_KEYS.converted)}</SelectItem>
          </SelectContent>
        </Select>
      </Card>

      <div className="grid gap-4 md:grid-cols-2">
        {loading && (
          <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">{t("mySi.loading")}</Card>
        )}
        {!loading && filtered.length === 0 && (
          <Card className="p-10 text-center text-sm text-muted-foreground md:col-span-2">
            {t("mySi.empty")}
          </Card>
        )}
        {!loading &&
          filtered.map((record) => (
            <Card key={record.recordId} className="flex flex-col gap-4 p-5">
              <div className="flex items-start justify-between gap-3">
                <Link
                  href={`/my-si/${record.recordId}`}
                  className="text-base font-semibold text-foreground hover:text-primary hover:underline"
                >
                  {record.title}
                </Link>
                <StatusBadge
                  label={t(PRERELEASE_STATUS_LABEL_KEYS[record.status])}
                  tone={PRERELEASE_STATUS_TONE[record.status]}
                />
              </div>

              <div className="flex flex-wrap gap-2 text-xs">
                <StatusBadge label={record.mainType} tone="neutral" />
                <StatusBadge label={record.trope} tone="neutral" />
              </div>

              <div className="space-y-1.5 text-xs text-muted-foreground">
                <p>{t("mySi.editorLabel")}：{record.editorName}</p>
                <p className="line-clamp-2">{t("mySi.noteLabel")}：{record.note || t("common.none")}</p>
                <p>{t("mySi.prereleasedAtLabel")}：{formatDateOnly(record.prereleasedAt)}</p>
              </div>

              <div className="mt-auto flex items-center gap-2">
                <Button asChild size="sm" variant="outline" className="bg-transparent">
                  <Link href={`/my-si/${record.recordId}`}>
                    <Eye className="mr-1 size-3.5" />
                    {t("common.view")}
                  </Link>
                </Button>
                {record.status === "converted" && record.projectId && (
                  <Button asChild size="sm">
                    <Link href={`/projects/${record.projectId}`}>
                      <ExternalLink className="mr-1 size-3.5" />
                      {t("mySi.enterProject")}
                    </Link>
                  </Button>
                )}
              </div>
            </Card>
          ))}
      </div>

      <p className="text-xs text-muted-foreground">
        {t("mySi.tip")}
      </p>
    </div>
  )
}
