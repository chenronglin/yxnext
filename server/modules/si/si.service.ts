import "server-only"

import { createHash } from "crypto"
import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import { ApiError } from "@/server/shared/api-response"
import type { ApiCurrentUser } from "@/server/shared/current-user"
import type { PrereleaseRecord, PrereleaseStatus, SiItem, SiVersion } from "@/types/si"

type StageCodeValue = "synopsis" | "outline" | "chapter" | "release"

type SiInput = {
  title?: string
  mainTypeId?: string | number | bigint | null
  mainType?: string | null
  trope?: string | string[] | null
  benchmark?: string | null
  benchmarkBooks?: unknown
  fitAuthorNote?: string | null
  remark?: string | null
  remarks?: string | null
  freshTwist?: string | null
  synopsis?: string | null
  coreSynopsis?: string | null
  fitAuthorIds?: Array<string | number | bigint>
  authorIds?: Array<string | number | bigint>
}

type SiListFilters = {
  keyword?: string | null
  status?: string | null
  mainType?: string | null
}

type PreissueListFilters = {
  keyword?: string | null
  status?: string | null
  authorId?: string | null
}

type PrepublishInput = {
  authorIds: Array<string | number | bigint>
  note?: string | null
}

type WithdrawInput = {
  reason?: string | null
}

type OperationLogInput = {
  actor: ApiCurrentUser
  action: string
  entityType: string
  entityId: bigint
  projectId?: bigint
  docId?: bigint
  siId?: bigint
  preissueId?: bigint
  beforeJson?: Prisma.InputJsonValue
  afterJson?: Prisma.InputJsonValue
  metadataJson?: Prisma.InputJsonValue
}

const storyIdeaInclude = {
  mainType: true,
  creatorEditor: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
  fitAuthors: {
    include: {
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      createdAt: "asc",
    },
  },
  preissues: {
    include: {
      editor: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
      project: {
        select: {
          projectId: true,
          title: true,
          currentStage: true,
        },
      },
    },
    orderBy: {
      preissuedAt: "desc",
    },
  },
  versions: {
    include: {
      editor: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      versionNo: "desc",
    },
  },
} satisfies Prisma.StoryIdeaInclude

const preissueInclude = {
  storyIdea: {
    include: {
      mainType: true,
    },
  },
  editor: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
  author: {
    select: {
      userId: true,
      username: true,
      displayName: true,
    },
  },
  project: {
    select: {
      projectId: true,
      title: true,
      currentStage: true,
    },
  },
} satisfies Prisma.SiPreissueInclude

type StoryIdeaRecord = Prisma.StoryIdeaGetPayload<{ include: typeof storyIdeaInclude }>
type PreissueRecord = Prisma.SiPreissueGetPayload<{ include: typeof preissueInclude }>
type TxClient = Prisma.TransactionClient

const STAGE_ORDER: StageCodeValue[] = ["synopsis", "outline", "chapter", "release"]

const STAGE_FALLBACK_DAYS: Record<StageCodeValue, number> = {
  synopsis: 5,
  outline: 7,
  chapter: 30,
  release: 7,
}

// 转项目时暂时用演示编辑器能消费的 Tiptap-like JSON 初始化梗概稿，不在后端解析文档节点。
const SYNOPSIS_DOC_SCHEMA_VERSION = 1

function trimToNull(value: string | null | undefined) {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

function normalizeTrope(value: SiInput["trope"]) {
  if (Array.isArray(value)) {
    return value.map((item) => item.trim()).filter(Boolean).join(" / ") || null
  }

  return trimToNull(value ?? null)
}

function hashJson(value: Prisma.InputJsonValue) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex")
}

function makeMainTypeCode(name: string) {
  // 主类型名称来自界面下拉文案；当数据库未预置时，用稳定 hash 生成不会冲突的内部 code。
  return `ui-${createHash("sha1").update(name).digest("hex").slice(0, 16)}`
}

function parseBigIntId(value: string | number | bigint, label: string) {
  const raw = String(value)

  if (!/^\d+$/.test(raw)) {
    throw new ApiError({
      status: 400,
      code: "INVALID_ID",
      message: `${label} 必须是数字 ID`,
    })
  }

  return BigInt(raw)
}

function uniqueBigIntIds(values: Array<string | number | bigint>, label: string) {
  const seen = new Set<string>()
  const result: bigint[] = []

  for (const value of values) {
    const id = parseBigIntId(value, label)
    const key = id.toString()

    if (!seen.has(key)) {
      seen.add(key)
      result.push(id)
    }
  }

  return result
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function toApiSiStatus(status: StoryIdeaRecord["status"]): SiItem["status"] {
  return status === "preissued" ? "prereleased" : status
}

function toDbSiStatus(status: string | null | undefined) {
  if (!status || status === "all") return null
  if (status === "prereleased") return "preissued"
  if (["draft", "preissued", "converted", "archived"].includes(status)) return status

  throw new ApiError({
    status: 400,
    code: "INVALID_STATUS",
    message: "SI 状态参数不正确",
  })
}

function toApiPreissueStatus(status: PreissueRecord["status"]): PrereleaseStatus {
  if (status === "preissued") return "active"
  if (status === "recalled") return "withdrawn"
  return "converted"
}

function toDbPreissueStatus(status: string | null | undefined) {
  if (!status || status === "all") return null
  if (status === "active") return "preissued"
  if (status === "withdrawn") return "recalled"
  if (["preissued", "recalled", "converted"].includes(status)) return status

  throw new ApiError({
    status: 400,
    code: "INVALID_STATUS",
    message: "预发记录状态参数不正确",
  })
}

function benchmarkToLabel(value: Prisma.JsonValue | null) {
  if (!value) return ""

  if (typeof value === "string") {
    return value
  }

  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item
        if (item && typeof item === "object" && "title" in item) return String(item.title ?? "")
        return ""
      })
      .filter(Boolean)
      .join("、")
  }

  if (typeof value === "object" && "title" in value) {
    return String(value.title ?? "")
  }

  return ""
}

function snapshotValue(snapshot: Prisma.JsonValue, key: string) {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && key in snapshot) {
    return snapshot[key]
  }

  return undefined
}

function snapshotString(snapshot: Prisma.JsonValue, key: string, fallback = "") {
  const value = snapshotValue(snapshot, key)
  return typeof value === "string" ? value : fallback
}

function snapshotBenchmarkToLabel(snapshot: Prisma.JsonValue, fallback: Prisma.JsonValue | null) {
  const value = snapshotValue(snapshot, "benchmarkBooks")
  return benchmarkToLabel(value === undefined ? fallback : (value as Prisma.JsonValue | null))
}

function serializeSiVersion(
  version: StoryIdeaRecord["versions"][number],
  currentVersionNo: number,
): SiVersion {
  return {
    id: version.siVersionId.toString(),
    version: version.versionNo,
    savedBy: userName(version.editor),
    savedAt: version.createdAt.toISOString(),
    note:
      version.action === "create"
        ? "初始草稿"
        : version.action === "rollback"
          ? "版本回退"
          : "内容更新",
    current: version.versionNo === currentVersionNo,
    title: snapshotString(version.snapshotJson, "title"),
    mainType: snapshotString(version.snapshotJson, "mainType"),
    trope: snapshotString(version.snapshotJson, "trope"),
    freshTwist: snapshotString(version.snapshotJson, "freshTwist"),
    synopsis: snapshotString(version.snapshotJson, "coreSynopsis"),
  }
}

type NormalizedBenchmark = {
  dbValue: Prisma.StoryIdeaCreateInput["benchmarkBooks"]
  snapshotValue: Prisma.InputJsonValue | null
}

function normalizeBenchmark(input: SiInput, fallback: Prisma.JsonValue | null): NormalizedBenchmark {
  if (input.benchmarkBooks !== undefined) {
    return input.benchmarkBooks === null
      ? { dbValue: Prisma.DbNull, snapshotValue: null }
      : {
          dbValue: input.benchmarkBooks as Prisma.InputJsonValue,
          snapshotValue: input.benchmarkBooks as Prisma.InputJsonValue,
        }
  }

  if (input.benchmark !== undefined) {
    const benchmark = trimToNull(input.benchmark)
    return benchmark
      ? { dbValue: benchmark, snapshotValue: benchmark }
      : { dbValue: Prisma.DbNull, snapshotValue: null }
  }

  return fallback === null
    ? { dbValue: Prisma.DbNull, snapshotValue: null }
    : { dbValue: fallback as Prisma.InputJsonValue, snapshotValue: fallback as Prisma.InputJsonValue }
}

function addDays(base: Date, days: number) {
  const next = new Date(base)
  next.setDate(next.getDate() + days)
  return next
}

function ensureCanManageSi(actor: ApiCurrentUser, si: { creatorEditorId: bigint }) {
  if (actor.role === "admin") return

  if (actor.role !== "editor" || si.creatorEditorId !== actor.userId) {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "无权操作该 SI",
    })
  }
}

function ensureEditorActor(actor: ApiCurrentUser) {
  if (actor.role !== "editor" && actor.role !== "admin") {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "只有编辑或管理员可以执行该操作",
    })
  }
}

function serializePreissue(record: PreissueRecord): PrereleaseRecord {
  const snapshot = record.siSnapshotJson

  return {
    id: record.preissueId.toString(),
    recordId: record.preissueId.toString(),
    siId: record.siId.toString(),
    siTitle: record.storyIdea.title,
    title: snapshotString(snapshot, "title", record.storyIdea.title),
    mainType: snapshotString(snapshot, "mainType", record.storyIdea.mainType?.name ?? ""),
    trope: snapshotString(snapshot, "trope", record.storyIdea.trope ?? ""),
    benchmark: snapshotBenchmarkToLabel(snapshot, record.storyIdea.benchmarkBooks),
    remark: snapshotString(snapshot, "remarks", record.storyIdea.remarks ?? ""),
    freshTwist: snapshotString(snapshot, "freshTwist", record.storyIdea.freshTwist ?? ""),
    synopsis: snapshotString(snapshot, "coreSynopsis", record.storyIdea.coreSynopsis ?? ""),
    authorId: record.authorId.toString(),
    authorName: userName(record.author),
    editorId: record.editorId.toString(),
    editorName: userName(record.editor),
    note: record.preissueNote ?? "",
    status: toApiPreissueStatus(record.status),
    prereleasedAt: record.preissuedAt.toISOString(),
    withdrawnAt: record.recalledAt?.toISOString(),
    convertedAt: record.convertedAt?.toISOString(),
    projectId: record.projectId?.toString(),
    projectName: record.project?.title,
    projectStage: record.project?.currentStage,
  }
}

function serializeStoryIdea(record: StoryIdeaRecord): SiItem {
  const preissues = record.preissues.map((preissue) =>
    serializePreissue({
      ...preissue,
      storyIdea: {
        ...record,
        mainType: record.mainType,
      },
    } as PreissueRecord),
  )

  return {
    id: record.siId.toString(),
    title: record.title,
    mainTypeId: record.mainTypeId?.toString(),
    mainType: record.mainType?.name ?? "",
    trope: record.trope ?? "",
    benchmark: benchmarkToLabel(record.benchmarkBooks),
    benchmarkBooks: record.benchmarkBooks,
    authors: record.fitAuthors.map((item) => userName(item.author)),
    authorIds: record.fitAuthors.map((item) => item.authorId.toString()),
    remark: record.remarks ?? "",
    fitAuthorNote: record.fitAuthorNote ?? "",
    freshTwist: record.freshTwist ?? "",
    synopsis: record.coreSynopsis ?? "",
    status: toApiSiStatus(record.status),
    createdBy: userName(record.creatorEditor),
    creatorEditorId: record.creatorEditorId.toString(),
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    prereleaseCount: record.preissues.length,
    converted: record.status === "converted" || preissues.some((item) => item.status === "converted"),
    currentVersionNo: record.currentVersionNo,
    latestVersionId: record.latestVersionId?.toString(),
    preissues,
    versions: record.versions.map((version) => serializeSiVersion(version, record.currentVersionNo)),
  }
}

function makeSnapshot(input: {
  siId: bigint
  title: string
  mainTypeId: bigint | null
  mainTypeName: string | null
  trope: string | null
  benchmarkBooks: Prisma.JsonValue | Prisma.InputJsonValue | null
  fitAuthorIds: bigint[]
  fitAuthorNote: string | null
  remarks: string | null
  freshTwist: string | null
  coreSynopsis: string | null
}) {
  return {
    siId: input.siId.toString(),
    title: input.title,
    mainTypeId: input.mainTypeId?.toString() ?? null,
    mainType: input.mainTypeName,
    trope: input.trope,
    benchmarkBooks: input.benchmarkBooks ?? null,
    fitAuthorIds: input.fitAuthorIds.map((id) => id.toString()),
    fitAuthorNote: input.fitAuthorNote,
    remarks: input.remarks,
    freshTwist: input.freshTwist,
    coreSynopsis: input.coreSynopsis,
  } satisfies Prisma.InputJsonObject
}

function readSnapshotString(snapshot: Prisma.JsonValue, key: string, fallback: string) {
  if (snapshot && typeof snapshot === "object" && !Array.isArray(snapshot) && key in snapshot) {
    const value = snapshot[key]
    return typeof value === "string" && value.trim() ? value : fallback
  }

  return fallback
}

function readSnapshotBigIntArray(snapshot: Prisma.JsonValue, key: string) {
  const value = snapshotValue(snapshot, key)

  if (!Array.isArray(value)) {
    return []
  }

  return value
    .map((item) => {
      if (typeof item !== "string" && typeof item !== "number" && typeof item !== "bigint") {
        return null
      }

      try {
        return parseBigIntId(item, `${key} 项`)
      } catch {
        return null
      }
    })
    .filter((item): item is bigint => item !== null)
}

function makeSynopsisDocContent(input: {
  title: string
  freshTwist: string | null
  coreSynopsis: string | null
}) {
  // 这里保留演示 UI 的块状文档形态，后续接真实文档编辑器时只需要替换 contentJson 生成逻辑。
  return {
    type: "doc",
    content: [
      {
        type: "heading",
        attrs: { level: 1 },
        content: [{ type: "text", text: "梗概" }],
      },
      {
        type: "paragraph",
        content: [{ type: "text", text: input.coreSynopsis || `《${input.title}》梗概待作者完善。` }],
      },
      ...(input.freshTwist
        ? [
            {
              type: "paragraph",
              content: [{ type: "text", text: `Fresh Twist：${input.freshTwist}` }],
            },
          ]
        : []),
    ],
  } satisfies Prisma.InputJsonObject
}

function countWordsForChineseText(text: string | null) {
  // 中文创作场景下先用字符数作为 word_count 的近似值，真实富文本统计后续由 Doc 模块统一负责。
  return text?.replace(/\s/g, "").length ?? 0
}

async function writeOperationLog(tx: TxClient, input: OperationLogInput) {
  await tx.operationLog.create({
    data: {
      actorUserId: input.actor.userId,
      actorRole: input.actor.role,
      action: input.action,
      entityType: input.entityType,
      entityId: input.entityId,
      projectId: input.projectId,
      docId: input.docId,
      siId: input.siId,
      preissueId: input.preissueId,
      beforeJson: input.beforeJson,
      afterJson: input.afterJson,
      metadataJson: input.metadataJson,
    },
  })
}

async function resolveMainType(
  tx: TxClient,
  input: Pick<SiInput, "mainTypeId" | "mainType">,
  fallbackId?: bigint | null,
) {
  if (input.mainTypeId !== undefined && input.mainTypeId !== null) {
    const mainTypeId = parseBigIntId(input.mainTypeId, "主类型 ID")
    const mainType = await tx.siMainType.findUnique({ where: { mainTypeId } })

    if (!mainType) {
      throw new ApiError({
        status: 400,
        code: "MAIN_TYPE_NOT_FOUND",
        message: "主类型不存在",
      })
    }

    return mainType
  }

  const mainTypeName = trimToNull(input.mainType ?? null)

  if (!mainTypeName) {
    if (fallbackId) {
      return tx.siMainType.findUnique({ where: { mainTypeId: fallbackId } })
    }

    return null
  }

  const existing = await tx.siMainType.findFirst({
    where: {
      OR: [{ name: mainTypeName }, { code: mainTypeName }],
    },
  })

  if (existing) {
    return existing
  }

  return tx.siMainType.create({
    data: {
      code: makeMainTypeCode(mainTypeName),
      name: mainTypeName,
      isActive: true,
    },
  })
}

async function validateFitAuthors(tx: TxClient, authorIds: bigint[]) {
  if (authorIds.length === 0) return []

  const authors = await tx.user.findMany({
    where: {
      userId: {
        in: authorIds,
      },
      role: "author",
      status: "active",
    },
    select: {
      userId: true,
    },
  })

  if (authors.length !== authorIds.length) {
    throw new ApiError({
      status: 400,
      code: "AUTHOR_NOT_FOUND",
      message: "适配作者中包含不存在或不可用的作者",
    })
  }

  return authors
}

async function replaceFitAuthors(tx: TxClient, siId: bigint, authorIds: bigint[]) {
  await tx.storyIdeaFitAuthor.deleteMany({
    where: {
      siId,
    },
  })

  if (authorIds.length === 0) return

  await tx.storyIdeaFitAuthor.createMany({
    data: authorIds.map((authorId) => ({
      siId,
      authorId,
    })),
  })
}

async function assertBoundAuthors(tx: TxClient, editorId: bigint, authorIds: bigint[]) {
  const authors = await tx.user.findMany({
    where: {
      userId: {
        in: authorIds,
      },
      role: "author",
      status: "active",
    },
    select: {
      userId: true,
    },
  })

  if (authors.length !== authorIds.length) {
    throw new ApiError({
      status: 400,
      code: "AUTHOR_NOT_FOUND",
      message: "预发作者中包含不存在或不可用的作者",
    })
  }

  const bindings = await tx.editorAuthorBinding.findMany({
    where: {
      editorId,
      authorId: {
        in: authorIds,
      },
      status: "active",
    },
    select: {
      authorId: true,
    },
  })

  if (bindings.length !== authorIds.length) {
    throw new ApiError({
      status: 403,
      code: "AUTHOR_NOT_BOUND",
      message: "只能预发给与你绑定中的作者",
    })
  }
}

export async function listStoryIdeas(actor: ApiCurrentUser, filters: SiListFilters = {}) {
  ensureEditorActor(actor)

  const dbStatus = toDbSiStatus(filters.status)
  const keyword = trimToNull(filters.keyword)
  const mainType = trimToNull(filters.mainType)

  const items = await prisma.storyIdea.findMany({
    where: {
      ...(actor.role === "editor" ? { creatorEditorId: actor.userId } : {}),
      ...(dbStatus ? { status: dbStatus as StoryIdeaRecord["status"] } : {}),
      ...(keyword
        ? {
            OR: [
              { title: { contains: keyword } },
              { trope: { contains: keyword } },
              { coreSynopsis: { contains: keyword } },
            ],
          }
        : {}),
      ...(mainType && mainType !== "all"
        ? {
            mainType: {
              name: mainType,
            },
          }
        : {}),
    },
    include: storyIdeaInclude,
    orderBy: {
      updatedAt: "desc",
    },
  })

  return {
    items: items.map(serializeStoryIdea),
    total: items.length,
  }
}

export async function listBoundAuthors(actor: ApiCurrentUser) {
  if (actor.role !== "editor") {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "只有编辑可以查看绑定作者",
    })
  }

  const bindings = await prisma.editorAuthorBinding.findMany({
    where: {
      editorId: actor.userId,
      status: "active",
      author: {
        role: "author",
        status: "active",
      },
    },
    include: {
      author: {
        select: {
          userId: true,
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: {
      boundAt: "desc",
    },
  })

  // 预发弹窗只需要稳定的 id/name，避免把绑定关系表结构泄漏给客户端。
  return {
    authors: bindings.map((binding) => ({
      id: binding.authorId.toString(),
      name: userName(binding.author),
    })),
  }
}

export async function listSiPreissues(actor: ApiCurrentUser, filters: PreissueListFilters = {}) {
  const dbStatus = toDbPreissueStatus(filters.status)
  const keyword = trimToNull(filters.keyword)
  const authorId =
    filters.authorId && filters.authorId !== "all"
      ? parseBigIntId(filters.authorId, "作者 ID")
      : null

  if (actor.role === "author" && dbStatus === "recalled") {
    return {
      records: [],
      total: 0,
    }
  }

  const records = await prisma.siPreissue.findMany({
    where: {
      ...(actor.role === "author"
        ? {
            authorId: actor.userId,
            // 作者端必须隐藏已收回记录；这是业务要求，不交给前端自行过滤。
            status: dbStatus ? (dbStatus as PreissueRecord["status"]) : { not: "recalled" },
          }
        : actor.role === "editor"
          ? {
              editorId: actor.userId,
              ...(dbStatus ? { status: dbStatus as PreissueRecord["status"] } : {}),
            }
          : {
              ...(dbStatus ? { status: dbStatus as PreissueRecord["status"] } : {}),
            }),
      ...(authorId ? { authorId } : {}),
      ...(keyword
        ? {
            storyIdea: {
              title: {
                contains: keyword,
              },
            },
          }
        : {}),
    },
    include: preissueInclude,
    orderBy: {
      preissuedAt: "desc",
    },
  })

  return {
    records: records.map(serializePreissue),
    total: records.length,
  }
}

export async function getSiPreissue(actor: ApiCurrentUser, recordIdValue: string) {
  const preissueId = parseBigIntId(recordIdValue, "预发记录 ID")
  const record = await prisma.siPreissue.findUnique({
    where: {
      preissueId,
    },
    include: preissueInclude,
  })

  if (!record) {
    throw new ApiError({
      status: 404,
      code: "PREISSUE_NOT_FOUND",
      message: "预发记录不存在",
    })
  }

  if (actor.role === "author" && (record.authorId !== actor.userId || record.status === "recalled")) {
    throw new ApiError({
      status: 404,
      code: "PREISSUE_NOT_FOUND",
      message: "预发记录不存在",
    })
  }

  if (actor.role === "editor" && record.editorId !== actor.userId) {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "无权查看该预发记录",
    })
  }

  return {
    record: serializePreissue(record),
  }
}

export async function getStoryIdea(actor: ApiCurrentUser, siIdValue: string) {
  const siId = parseBigIntId(siIdValue, "SI ID")
  const record = await prisma.storyIdea.findUnique({
    where: {
      siId,
    },
    include: storyIdeaInclude,
  })

  if (!record) {
    throw new ApiError({
      status: 404,
      code: "SI_NOT_FOUND",
      message: "SI 不存在",
    })
  }

  ensureCanManageSi(actor, record)

  return {
    si: serializeStoryIdea(record),
  }
}

export async function createStoryIdea(actor: ApiCurrentUser, input: SiInput) {
  ensureEditorActor(actor)

  const title = trimToNull(input.title)
  const coreSynopsis = trimToNull(input.coreSynopsis ?? input.synopsis ?? null)

  if (!title) {
    throw new ApiError({
      status: 400,
      code: "TITLE_REQUIRED",
      message: "请填写 SI 标题",
    })
  }

  if (!coreSynopsis) {
    throw new ApiError({
      status: 400,
      code: "SYNOPSIS_REQUIRED",
      message: "请填写核心故事梗概",
    })
  }

  const result = await prisma.$transaction(async (tx) => {
    const mainType = await resolveMainType(tx, input)

    if (!mainType) {
      throw new ApiError({
        status: 400,
        code: "MAIN_TYPE_REQUIRED",
        message: "请选择主类型",
      })
    }

    const fitAuthorIds = uniqueBigIntIds(input.fitAuthorIds ?? input.authorIds ?? [], "作者 ID")
    await validateFitAuthors(tx, fitAuthorIds)

    const benchmarkBooks = normalizeBenchmark(input, null)
    const storyIdea = await tx.storyIdea.create({
      data: {
        title,
        mainTypeId: mainType.mainTypeId,
        trope: normalizeTrope(input.trope),
        benchmarkBooks: benchmarkBooks.dbValue,
        fitAuthorNote: trimToNull(input.fitAuthorNote ?? null),
        remarks: trimToNull(input.remarks ?? input.remark ?? null),
        freshTwist: trimToNull(input.freshTwist ?? null),
        coreSynopsis,
        creatorEditorId: actor.userId,
      },
    })

    await replaceFitAuthors(tx, storyIdea.siId, fitAuthorIds)

    const snapshot = makeSnapshot({
      siId: storyIdea.siId,
      title: storyIdea.title,
      mainTypeId: storyIdea.mainTypeId,
      mainTypeName: mainType.name,
      trope: storyIdea.trope,
      benchmarkBooks: benchmarkBooks.snapshotValue,
      fitAuthorIds,
      fitAuthorNote: storyIdea.fitAuthorNote,
      remarks: storyIdea.remarks,
      freshTwist: storyIdea.freshTwist,
      coreSynopsis: storyIdea.coreSynopsis,
    })

    const version = await tx.storyIdeaVersion.create({
      data: {
        siId: storyIdea.siId,
        versionNo: 1,
        action: "create",
        snapshotJson: snapshot,
        editorId: actor.userId,
        contentHash: hashJson(snapshot),
      },
    })

    await tx.storyIdea.update({
      where: {
        siId: storyIdea.siId,
      },
      data: {
        currentVersionNo: 1,
        latestVersionId: version.siVersionId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.create",
      entityType: "story_idea",
      entityId: storyIdea.siId,
      siId: storyIdea.siId,
      afterJson: snapshot,
    })

    return storyIdea.siId
  })

  return getStoryIdea(actor, result.toString())
}

export async function updateStoryIdea(actor: ApiCurrentUser, siIdValue: string, input: SiInput) {
  const siId = parseBigIntId(siIdValue, "SI ID")

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.storyIdea.findUnique({
      where: {
        siId,
      },
      include: {
        mainType: true,
        fitAuthors: true,
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "SI_NOT_FOUND",
        message: "SI 不存在",
      })
    }

    ensureCanManageSi(actor, existing)

    if (existing.status === "converted" || existing.status === "archived") {
      throw new ApiError({
        status: 409,
        code: "SI_LOCKED",
        message: "已转项目或已归档的 SI 不可编辑",
      })
    }

    const nextTitle = input.title === undefined ? existing.title : trimToNull(input.title)
    const nextCoreSynopsis =
      input.coreSynopsis === undefined && input.synopsis === undefined
        ? existing.coreSynopsis
        : trimToNull(input.coreSynopsis ?? input.synopsis ?? null)

    if (!nextTitle) {
      throw new ApiError({
        status: 400,
        code: "TITLE_REQUIRED",
        message: "请填写 SI 标题",
      })
    }

    if (!nextCoreSynopsis) {
      throw new ApiError({
        status: 400,
        code: "SYNOPSIS_REQUIRED",
        message: "请填写核心故事梗概",
      })
    }

    const mainType =
      input.mainTypeId !== undefined || input.mainType !== undefined
        ? await resolveMainType(tx, input, existing.mainTypeId)
        : existing.mainType

    if (!mainType) {
      throw new ApiError({
        status: 400,
        code: "MAIN_TYPE_REQUIRED",
        message: "请选择主类型",
      })
    }

    const fitAuthorIds =
      input.fitAuthorIds !== undefined || input.authorIds !== undefined
        ? uniqueBigIntIds(input.fitAuthorIds ?? input.authorIds ?? [], "作者 ID")
        : existing.fitAuthors.map((item) => item.authorId)

    await validateFitAuthors(tx, fitAuthorIds)

    const benchmarkBooks = normalizeBenchmark(input, existing.benchmarkBooks)
    const beforeSnapshot = makeSnapshot({
      siId: existing.siId,
      title: existing.title,
      mainTypeId: existing.mainTypeId,
      mainTypeName: existing.mainType?.name ?? null,
      trope: existing.trope,
      benchmarkBooks: existing.benchmarkBooks,
      fitAuthorIds: existing.fitAuthors.map((item) => item.authorId),
      fitAuthorNote: existing.fitAuthorNote,
      remarks: existing.remarks,
      freshTwist: existing.freshTwist,
      coreSynopsis: existing.coreSynopsis,
    })

    const updated = await tx.storyIdea.update({
      where: {
        siId,
      },
      data: {
        title: nextTitle,
        mainTypeId: mainType.mainTypeId,
        trope: input.trope === undefined ? existing.trope : normalizeTrope(input.trope),
        benchmarkBooks: benchmarkBooks.dbValue,
        fitAuthorNote:
          input.fitAuthorNote === undefined ? existing.fitAuthorNote : trimToNull(input.fitAuthorNote),
        remarks:
          input.remarks === undefined && input.remark === undefined
            ? existing.remarks
            : trimToNull(input.remarks ?? input.remark ?? null),
        freshTwist:
          input.freshTwist === undefined ? existing.freshTwist : trimToNull(input.freshTwist),
        coreSynopsis: nextCoreSynopsis,
      },
    })

    await replaceFitAuthors(tx, siId, fitAuthorIds)

    const snapshot = makeSnapshot({
      siId: updated.siId,
      title: updated.title,
      mainTypeId: updated.mainTypeId,
      mainTypeName: mainType.name,
      trope: updated.trope,
      benchmarkBooks: benchmarkBooks.snapshotValue,
      fitAuthorIds,
      fitAuthorNote: updated.fitAuthorNote,
      remarks: updated.remarks,
      freshTwist: updated.freshTwist,
      coreSynopsis: updated.coreSynopsis,
    })

    const version = await tx.storyIdeaVersion.create({
      data: {
        siId,
        versionNo: existing.currentVersionNo + 1,
        action: "update",
        snapshotJson: snapshot,
        editorId: actor.userId,
        contentHash: hashJson(snapshot),
      },
    })

    await tx.storyIdea.update({
      where: {
        siId,
      },
      data: {
        currentVersionNo: existing.currentVersionNo + 1,
        latestVersionId: version.siVersionId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.update",
      entityType: "story_idea",
      entityId: siId,
      siId,
      beforeJson: beforeSnapshot,
      afterJson: snapshot,
    })

    return siId
  })

  return getStoryIdea(actor, result.toString())
}

export async function prepublishStoryIdea(actor: ApiCurrentUser, siIdValue: string, input: PrepublishInput) {
  if (actor.role !== "editor") {
    throw new ApiError({
      status: 403,
      code: "FORBIDDEN",
      message: "只有编辑可以预发 SI",
    })
  }

  const siId = parseBigIntId(siIdValue, "SI ID")
  const authorIds = uniqueBigIntIds(input.authorIds, "作者 ID")

  if (authorIds.length === 0) {
    throw new ApiError({
      status: 400,
      code: "AUTHOR_REQUIRED",
      message: "请选择预发作者",
    })
  }

  const records = await prisma.$transaction(async (tx) => {
    const si = await tx.storyIdea.findUnique({
      where: {
        siId,
      },
      include: {
        mainType: true,
        fitAuthors: true,
      },
    })

    if (!si) {
      throw new ApiError({
        status: 404,
        code: "SI_NOT_FOUND",
        message: "SI 不存在",
      })
    }

    ensureCanManageSi(actor, si)

    if (si.status === "converted" || si.status === "archived") {
      throw new ApiError({
        status: 409,
        code: "SI_CANNOT_PREPUBLISH",
        message: "已转项目或已归档的 SI 不可预发",
      })
    }

    await assertBoundAuthors(tx, actor.userId, authorIds)

    const duplicated = await tx.siPreissue.findMany({
      where: {
        siId,
        authorId: {
          in: authorIds,
        },
        status: "preissued",
      },
      select: {
        authorId: true,
      },
    })

    if (duplicated.length > 0) {
      throw new ApiError({
        status: 409,
        code: "PREISSUE_DUPLICATED",
        message: "所选作者中存在有效预发记录，不能重复预发",
      })
    }

    const snapshot = makeSnapshot({
      siId: si.siId,
      title: si.title,
      mainTypeId: si.mainTypeId,
      mainTypeName: si.mainType?.name ?? null,
      trope: si.trope,
      benchmarkBooks: si.benchmarkBooks,
      fitAuthorIds: si.fitAuthors.map((item) => item.authorId),
      fitAuthorNote: si.fitAuthorNote,
      remarks: si.remarks,
      freshTwist: si.freshTwist,
      coreSynopsis: si.coreSynopsis,
    })

    const created: PreissueRecord[] = []

    for (const authorId of authorIds) {
      const record = await tx.siPreissue.create({
        data: {
          siId,
          siVersionId: si.latestVersionId,
          editorId: actor.userId,
          authorId,
          preissueNote: trimToNull(input.note ?? null),
          siSnapshotJson: snapshot,
          status: "preissued",
        },
        include: preissueInclude,
      })

      created.push(record)
    }

    if (si.status === "draft") {
      await tx.storyIdea.update({
        where: {
          siId,
        },
        data: {
          status: "preissued",
        },
      })
    }

    await tx.notification.createMany({
      data: authorIds.map((authorId) => ({
        recipientUserId: authorId,
        type: "si_preissued",
        title: "收到新的 SI 预发",
        body: `编辑向你预发了《${si.title}》。`,
        siId,
        entityType: "si_preissue",
        entityId: created.find((item) => item.authorId === authorId)?.preissueId,
      })),
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.prepublish",
      entityType: "story_idea",
      entityId: siId,
      siId,
      afterJson: {
        authorIds: authorIds.map((id) => id.toString()),
        preissueIds: created.map((item) => item.preissueId.toString()),
      },
    })

    return created
  })

  return {
    records: records.map(serializePreissue),
  }
}

export async function withdrawSiPreissue(actor: ApiCurrentUser, recordIdValue: string, input: WithdrawInput = {}) {
  const preissueId = parseBigIntId(recordIdValue, "预发记录 ID")

  const record = await prisma.$transaction(async (tx) => {
    const existing = await tx.siPreissue.findUnique({
      where: {
        preissueId,
      },
      include: {
        storyIdea: true,
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "PREISSUE_NOT_FOUND",
        message: "预发记录不存在",
      })
    }

    ensureCanManageSi(actor, existing.storyIdea)

    if (existing.status === "converted") {
      throw new ApiError({
        status: 409,
        code: "PREISSUE_CONVERTED",
        message: "已转项目的预发记录不可收回",
      })
    }

    if (existing.status === "recalled") {
      throw new ApiError({
        status: 409,
        code: "PREISSUE_RECALLED",
        message: "该预发记录已收回",
      })
    }

    const updated = await tx.siPreissue.update({
      where: {
        preissueId,
      },
      data: {
        status: "recalled",
        recalledAt: new Date(),
      },
      include: preissueInclude,
    })

    const activeCount = await tx.siPreissue.count({
      where: {
        siId: existing.siId,
        status: "preissued",
      },
    })

    if (activeCount === 0 && existing.storyIdea.status === "preissued") {
      await tx.storyIdea.update({
        where: {
          siId: existing.siId,
        },
        data: {
          status: "draft",
        },
      })
    }

    await writeOperationLog(tx, {
      actor,
      action: "si_preissue.withdraw",
      entityType: "si_preissue",
      entityId: preissueId,
      siId: existing.siId,
      preissueId,
      beforeJson: {
        status: existing.status,
      },
      afterJson: {
        status: "recalled",
        reason: trimToNull(input.reason ?? null),
      },
    })

    return updated
  })

  return {
    record: serializePreissue(record),
  }
}

export async function convertSiPreissueToProject(actor: ApiCurrentUser, recordIdValue: string) {
  ensureEditorActor(actor)

  const preissueId = parseBigIntId(recordIdValue, "预发记录 ID")

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.siPreissue.findUnique({
      where: {
        preissueId,
      },
      include: {
        storyIdea: {
          include: {
            mainType: true,
          },
        },
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "PREISSUE_NOT_FOUND",
        message: "预发记录不存在",
      })
    }

    ensureCanManageSi(actor, existing.storyIdea)

    if (existing.status === "recalled") {
      throw new ApiError({
        status: 409,
        code: "PREISSUE_RECALLED",
        message: "已收回的预发记录不可转项目",
      })
    }

    if (existing.status === "converted" || existing.projectId) {
      throw new ApiError({
        status: 409,
        code: "PREISSUE_ALREADY_CONVERTED",
        message: "该预发记录已转项目，不能重复创建项目",
      })
    }

    if (existing.storyIdea.status === "converted") {
      throw new ApiError({
        status: 409,
        code: "SI_ALREADY_CONVERTED",
        message: "该 SI 已转项目，不能重复创建项目",
      })
    }

    if (existing.storyIdea.status === "archived") {
      throw new ApiError({
        status: 409,
        code: "SI_ARCHIVED",
        message: "已归档的 SI 不可转项目",
      })
    }

    const existedProject = await tx.project.findFirst({
      where: {
        OR: [{ siPreissueId: preissueId }, { sourceSiId: existing.siId }],
      },
      select: {
        projectId: true,
      },
    })

    if (existedProject) {
      throw new ApiError({
        status: 409,
        code: "PROJECT_ALREADY_EXISTS",
        message: "该预发记录或 SI 已创建过项目",
      })
    }

    const snapshot = existing.siSnapshotJson
    const title = readSnapshotString(snapshot, "title", existing.storyIdea.title)
    const freshTwist = readSnapshotString(snapshot, "freshTwist", existing.storyIdea.freshTwist ?? "")
    const coreSynopsis = readSnapshotString(snapshot, "coreSynopsis", existing.storyIdea.coreSynopsis ?? "")
    const now = new Date()

    const project = await tx.project.create({
      data: {
        sourceSiId: existing.siId,
        siPreissueId: preissueId,
        title,
        intro: coreSynopsis || freshTwist || null,
        editorId: existing.editorId,
        authorId: existing.authorId,
        lifecycleStatus: "active",
        currentStage: "synopsis",
        releaseStatus: "locked",
        createdBy: actor.userId,
      },
    })

    const defaultPlans = await tx.stagePlanDefault.findMany({
      where: {
        stageCode: {
          in: STAGE_ORDER,
        },
      },
    })
    const defaultPlanMap = new Map(defaultPlans.map((item) => [item.stageCode, item.defaultPlanDays]))

    await tx.projectStagePlan.createMany({
      data: STAGE_ORDER.map((stageCode) => {
        const planDays = defaultPlanMap.get(stageCode) ?? STAGE_FALLBACK_DAYS[stageCode]
        const isFirstStage = stageCode === "synopsis"

        return {
          projectId: project.projectId,
          stageCode,
          gateStatus: isFirstStage ? "unlocked" : "locked",
          timelineStatus: isFirstStage ? "in_progress" : "not_started",
          planDays,
          unlockedAt: isFirstStage ? now : null,
          startedAt: isFirstStage ? now : null,
          dueAt: isFirstStage ? addDays(now, planDays) : null,
        }
      }),
    })

    const contentJson = makeSynopsisDocContent({
      title,
      freshTwist: freshTwist || null,
      coreSynopsis: coreSynopsis || null,
    })
    const wordCount = countWordsForChineseText(coreSynopsis)

    const doc = await tx.doc.create({
      data: {
        projectId: project.projectId,
        docType: "synopsis",
        stageCode: "synopsis",
        title: "梗概",
        status: "draft",
        holderRole: "author",
        currentWordCount: wordCount,
        currentPlainText: coreSynopsis || null,
        currentCleanText: coreSynopsis || null,
        summary: freshTwist || null,
        lastAction: "author_save",
        lastActorId: existing.authorId,
        lastActionAt: now,
      },
    })

    const draft = await tx.docCurrentDraft.create({
      data: {
        docId: doc.docId,
        ownerRole: "author",
        ownerUserId: existing.authorId,
        contentSchemaVersion: SYNOPSIS_DOC_SCHEMA_VERSION,
        contentJson,
        wordCount,
        plainText: coreSynopsis || null,
        cleanText: coreSynopsis || null,
        exportText: coreSynopsis || null,
        summary: freshTwist || null,
        status: "active",
      },
    })

    await tx.doc.update({
      where: {
        docId: doc.docId,
      },
      data: {
        activeDraftId: draft.draftId,
      },
    })

    await tx.siPreissue.update({
      where: {
        preissueId,
      },
      data: {
        status: "converted",
        projectId: project.projectId,
        convertedAt: now,
      },
    })

    await tx.storyIdea.update({
      where: {
        siId: existing.siId,
      },
      data: {
        status: "converted",
      },
    })

    await tx.notification.create({
      data: {
        recipientUserId: existing.authorId,
        type: "project_created_from_si",
        title: "SI 已确认转项目",
        body: `《${title}》已创建为项目，请进入项目开始梗概阶段。`,
        projectId: project.projectId,
        siId: existing.siId,
        preissueId,
        entityType: "project",
        entityId: project.projectId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "si_preissue.convert_to_project",
      entityType: "si_preissue",
      entityId: preissueId,
      projectId: project.projectId,
      docId: doc.docId,
      siId: existing.siId,
      preissueId,
      beforeJson: {
        preissueStatus: existing.status,
        siStatus: existing.storyIdea.status,
        projectId: existing.projectId?.toString() ?? null,
      },
      afterJson: {
        preissueStatus: "converted",
        siStatus: "converted",
        projectId: project.projectId.toString(),
        synopsisDocId: doc.docId.toString(),
        synopsisDraftId: draft.draftId.toString(),
      },
    })

    return {
      projectId: project.projectId,
      docId: doc.docId,
    }
  })

  const record = await prisma.siPreissue.findUniqueOrThrow({
    where: {
      preissueId,
    },
    include: preissueInclude,
  })

  return {
    project: {
      id: result.projectId.toString(),
      projectId: result.projectId.toString(),
      synopsisDocId: result.docId.toString(),
    },
    record: serializePreissue(record),
  }
}

export async function rollbackStoryIdeaVersion(
  actor: ApiCurrentUser,
  siIdValue: string,
  versionIdValue: string,
) {
  const siId = parseBigIntId(siIdValue, "SI ID")
  const versionId = parseBigIntId(versionIdValue, "版本 ID")

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.storyIdea.findUnique({
      where: {
        siId,
      },
      include: {
        mainType: true,
        fitAuthors: true,
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "SI_NOT_FOUND",
        message: "SI 不存在",
      })
    }

    ensureCanManageSi(actor, existing)

    if (existing.status === "converted" || existing.status === "archived") {
      throw new ApiError({
        status: 409,
        code: "SI_ROLLBACK_FORBIDDEN",
        message: "已转项目或已归档的 SI 不可回退版本",
      })
    }

    const version = await tx.storyIdeaVersion.findFirst({
      where: {
        siVersionId: versionId,
        siId,
      },
      select: {
        siVersionId: true,
        versionNo: true,
        snapshotJson: true,
      },
    })

    if (!version) {
      throw new ApiError({
        status: 404,
        code: "SI_VERSION_NOT_FOUND",
        message: "指定版本不存在",
      })
    }

    const snapshot = version.snapshotJson
    const title = readSnapshotString(snapshot, "title", existing.title)
    const trope = trimToNull(snapshotString(snapshot, "trope", existing.trope ?? ""))
    const fitAuthorNote = trimToNull(snapshotString(snapshot, "fitAuthorNote", existing.fitAuthorNote ?? ""))
    const remarks = trimToNull(snapshotString(snapshot, "remarks", existing.remarks ?? ""))
    const freshTwist = trimToNull(snapshotString(snapshot, "freshTwist", existing.freshTwist ?? ""))
    const coreSynopsis = trimToNull(snapshotString(snapshot, "coreSynopsis", existing.coreSynopsis ?? ""))

    if (!title || !coreSynopsis) {
      throw new ApiError({
        status: 409,
        code: "SI_VERSION_SNAPSHOT_INVALID",
        message: "目标版本快照缺少必要字段，无法回退",
      })
    }

    const snapshotMainTypeIdRaw = snapshotValue(snapshot, "mainTypeId")
    const snapshotMainTypeId =
      typeof snapshotMainTypeIdRaw === "string" && /^\d+$/.test(snapshotMainTypeIdRaw)
        ? parseBigIntId(snapshotMainTypeIdRaw, "主类型 ID")
        : null
    const snapshotMainTypeName = trimToNull(snapshotString(snapshot, "mainType", existing.mainType?.name ?? ""))

    const mainType = snapshotMainTypeId
      ? await tx.siMainType.findUnique({
          where: {
            mainTypeId: snapshotMainTypeId,
          },
        })
      : await resolveMainType(
          tx,
          {
            mainType: snapshotMainTypeName,
          },
          existing.mainTypeId,
        )

    if (!mainType) {
      throw new ApiError({
        status: 409,
        code: "SI_VERSION_MAIN_TYPE_INVALID",
        message: "目标版本对应的主类型不存在，无法回退",
      })
    }

    const fitAuthorIds = readSnapshotBigIntArray(snapshot, "fitAuthorIds")
    await validateFitAuthors(tx, fitAuthorIds)

    const benchmarkBooksValue = snapshotValue(snapshot, "benchmarkBooks")
    const normalizedBenchmark =
      benchmarkBooksValue === undefined || benchmarkBooksValue === null
        ? Prisma.DbNull
        : (benchmarkBooksValue as Prisma.InputJsonValue)

    const beforeSnapshot = makeSnapshot({
      siId: existing.siId,
      title: existing.title,
      mainTypeId: existing.mainTypeId,
      mainTypeName: existing.mainType?.name ?? null,
      trope: existing.trope,
      benchmarkBooks: existing.benchmarkBooks,
      fitAuthorIds: existing.fitAuthors.map((item) => item.authorId),
      fitAuthorNote: existing.fitAuthorNote,
      remarks: existing.remarks,
      freshTwist: existing.freshTwist,
      coreSynopsis: existing.coreSynopsis,
    })

    const updated = await tx.storyIdea.update({
      where: {
        siId,
      },
      data: {
        title,
        mainTypeId: mainType.mainTypeId,
        trope,
        benchmarkBooks: normalizedBenchmark,
        fitAuthorNote,
        remarks,
        freshTwist,
        coreSynopsis,
      },
    })

    await replaceFitAuthors(tx, siId, fitAuthorIds)

    const rollbackSnapshot = makeSnapshot({
      siId: updated.siId,
      title: updated.title,
      mainTypeId: updated.mainTypeId,
      mainTypeName: mainType.name,
      trope: updated.trope,
      benchmarkBooks: benchmarkBooksValue === undefined ? null : (benchmarkBooksValue as Prisma.InputJsonValue | null),
      fitAuthorIds,
      fitAuthorNote: updated.fitAuthorNote,
      remarks: updated.remarks,
      freshTwist: updated.freshTwist,
      coreSynopsis: updated.coreSynopsis,
    })

    const nextVersion = await tx.storyIdeaVersion.create({
      data: {
        siId,
        versionNo: existing.currentVersionNo + 1,
        action: "rollback",
        snapshotJson: rollbackSnapshot,
        editorId: actor.userId,
        rollbackFromVersionId: version.siVersionId,
        contentHash: hashJson(rollbackSnapshot),
      },
    })

    await tx.storyIdea.update({
      where: {
        siId,
      },
      data: {
        currentVersionNo: existing.currentVersionNo + 1,
        latestVersionId: nextVersion.siVersionId,
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.rollback",
      entityType: "story_idea",
      entityId: siId,
      siId,
      beforeJson: beforeSnapshot,
      afterJson: rollbackSnapshot,
      metadataJson: {
        rollbackFromVersionId: version.siVersionId.toString(),
        rollbackFromVersionNo: version.versionNo,
      },
    })

    return siId
  })

  return getStoryIdea(actor, result.toString())
}

export async function archiveStoryIdea(actor: ApiCurrentUser, siIdValue: string) {
  const siId = parseBigIntId(siIdValue, "SI ID")

  const result = await prisma.$transaction(async (tx) => {
    const existing = await tx.storyIdea.findUnique({
      where: {
        siId,
      },
      include: {
        mainType: true,
        fitAuthors: true,
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "SI_NOT_FOUND",
        message: "SI 不存在",
      })
    }

    ensureCanManageSi(actor, existing)

    if (existing.status === "converted") {
      throw new ApiError({
        status: 409,
        code: "SI_ARCHIVE_FORBIDDEN",
        message: "已转项目的 SI 不可归档",
      })
    }

    if (existing.status === "archived") {
      throw new ApiError({
        status: 409,
        code: "SI_ALREADY_ARCHIVED",
        message: "该 SI 已归档",
      })
    }

    const beforeSnapshot = makeSnapshot({
      siId: existing.siId,
      title: existing.title,
      mainTypeId: existing.mainTypeId,
      mainTypeName: existing.mainType?.name ?? null,
      trope: existing.trope,
      benchmarkBooks: existing.benchmarkBooks,
      fitAuthorIds: existing.fitAuthors.map((item) => item.authorId),
      fitAuthorNote: existing.fitAuthorNote,
      remarks: existing.remarks,
      freshTwist: existing.freshTwist,
      coreSynopsis: existing.coreSynopsis,
    })

    await tx.storyIdea.update({
      where: {
        siId,
      },
      data: {
        status: "archived",
        archivedAt: new Date(),
      },
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.archive",
      entityType: "story_idea",
      entityId: siId,
      siId,
      beforeJson: {
        status: existing.status,
      },
      afterJson: {
        status: "archived",
      },
      metadataJson: beforeSnapshot,
    })

    return siId
  })

  return getStoryIdea(actor, result.toString())
}

export async function deleteStoryIdea(actor: ApiCurrentUser, siIdValue: string) {
  const siId = parseBigIntId(siIdValue, "SI ID")

  await prisma.$transaction(async (tx) => {
    const existing = await tx.storyIdea.findUnique({
      where: {
        siId,
      },
      include: {
        mainType: true,
        fitAuthors: true,
      },
    })

    if (!existing) {
      throw new ApiError({
        status: 404,
        code: "SI_NOT_FOUND",
        message: "SI 不存在",
      })
    }

    ensureCanManageSi(actor, existing)

    if (existing.status === "converted") {
      throw new ApiError({
        status: 409,
        code: "SI_DELETE_FORBIDDEN",
        message: "已转项目的 SI 不可删除",
      })
    }

    const relatedProject = await tx.project.findFirst({
      where: {
        sourceSiId: siId,
      },
      select: {
        projectId: true,
      },
    })

    if (relatedProject) {
      throw new ApiError({
        status: 409,
        code: "SI_DELETE_FORBIDDEN",
        message: "该 SI 已关联项目，不可删除",
      })
    }

    const beforeSnapshot = makeSnapshot({
      siId: existing.siId,
      title: existing.title,
      mainTypeId: existing.mainTypeId,
      mainTypeName: existing.mainType?.name ?? null,
      trope: existing.trope,
      benchmarkBooks: existing.benchmarkBooks,
      fitAuthorIds: existing.fitAuthors.map((item) => item.authorId),
      fitAuthorNote: existing.fitAuthorNote,
      remarks: existing.remarks,
      freshTwist: existing.freshTwist,
      coreSynopsis: existing.coreSynopsis,
    })

    await writeOperationLog(tx, {
      actor,
      action: "si.delete",
      entityType: "story_idea",
      entityId: siId,
      siId,
      beforeJson: beforeSnapshot,
      afterJson: {
        deleted: true,
      },
    })

    // 删除动作的日志必须先写再删主记录；
    // 否则 operation_logs.si_id 在插入时会引用一个已不存在的外键。
    await tx.storyIdea.delete({
      where: {
        siId,
      },
    })
  })

  return {
    ok: true,
  }
}
