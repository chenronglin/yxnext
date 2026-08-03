import "server-only"

import { Prisma } from "@prisma/client"

import { prisma } from "@/server/db/prisma"
import type {
  OpenProjectChapter,
  OpenProjectItem,
  OpenProjectListInput,
  OpenProjectListResult,
  OpenProjectStagePlan,
} from "@/types/open-api"

// Open API 使用专用查询，不复用管理员 Service，也不构造虚假的管理员身份。
// 查询只选择稳定契约所需数据，避免把审计日志、后台筛选选项等治理信息暴露给 Agent。
const openProjectInclude = {
  sourceSi: {
    select: {
      mainType: {
        select: {
          name: true,
        },
      },
    },
  },
  editor: {
    select: {
      username: true,
      displayName: true,
    },
  },
  author: {
    select: {
      username: true,
      displayName: true,
    },
  },
  stagePlans: {
    orderBy: {
      stageCode: "asc",
    },
  },
  docs: {
    where: {
      isDeleted: false,
    },
    include: {
      lastActor: {
        select: {
          username: true,
          displayName: true,
        },
      },
    },
    orderBy: [{ stageCode: "asc" }, { sortOrder: "asc" }, { chapterNo: "asc" }],
  },
} satisfies Prisma.ProjectInclude

type OpenProjectRecord = Prisma.ProjectGetPayload<{ include: typeof openProjectInclude }>

type ProjectSyncRow = {
  projectId: bigint
  syncUpdatedAt: Date
}

function userName(user: { username: string; displayName: string | null }) {
  return user.displayName ?? user.username
}

function toChapterStatus(status: "draft" | "submitted" | "rejected" | "approved"): OpenProjectChapter["status"] {
  // 数据库 rejected 在现有项目接口中稳定映射为 returned，对外接口继续保持同一语义。
  return status === "rejected" ? "returned" : status
}

function toStagePlan(plan: OpenProjectRecord["stagePlans"][number]): OpenProjectStagePlan {
  return {
    stage: plan.stageCode,
    planDays: plan.planDays,
    startAt: plan.startedAt?.toISOString() ?? null,
    dueAt: plan.dueAt?.toISOString() ?? null,
    finishedAt: plan.completedAt?.toISOString() ?? null,
    status: plan.timelineStatus,
    timingNote:
      plan.stageCode === "synopsis"
        ? "确认转项目后开始"
        : plan.stageCode === "outline"
          ? "梗概通过后开始"
          : plan.stageCode === "chapter"
            ? "细纲通过后开始"
            : "手动解锁后开始",
  }
}

function toChapter(doc: OpenProjectRecord["docs"][number]): OpenProjectChapter {
  return {
    id: doc.docId.toString(),
    // 管理员项目接口优先使用结构化章节号；历史数据没有章节号时回退到显示顺序。
    order: doc.chapterNo ?? doc.sortOrder,
    title: doc.title,
    status: toChapterStatus(doc.status),
    holder: doc.holderRole,
    words: doc.currentWordCount,
    lastNote: doc.lastHandoffNote ?? "",
    lastOperator: doc.lastActor ? userName(doc.lastActor) : "系统",
    lastOperatedAt: (doc.lastActionAt ?? doc.updatedAt).toISOString(),
    approved: doc.status === "approved",
  }
}

function toOpenProject(
  project: OpenProjectRecord,
  syncUpdatedAt: Date,
  includeChapters: boolean,
): OpenProjectItem {
  const chapterDocs = project.docs.filter((doc) => doc.docType === "chapter")

  return {
    id: project.projectId.toString(),
    title: project.title,
    author: userName(project.author),
    authorId: project.authorId.toString(),
    editor: userName(project.editor),
    editorId: project.editorId.toString(),
    // 当前系统没有 category 字段，按已审批方案使用来源 SI 的现有 mainType；没有主类型时明确返回 null。
    mainType: project.sourceSi.mainType?.name ?? null,
    stage: project.currentStage,
    lifecycle: project.lifecycleStatus,
    createdAt: project.createdAt.toISOString(),
    // updatedAt 保持当前系统语义，仅代表 projects.updated_at，不把它重新解释成聚合更新时间。
    updatedAt: project.updatedAt.toISOString(),
    syncUpdatedAt: syncUpdatedAt.toISOString(),
    totalChapters: chapterDocs.length,
    approvedChapters: chapterDocs.filter((doc) => doc.status === "approved").length,
    stagePlans: project.stagePlans.map(toStagePlan),
    // chapters 是显式可选字段；未请求时完全省略，避免空数组被误解为项目没有章节。
    ...(includeChapters ? { chapters: chapterDocs.map(toChapter) } : {}),
  }
}

// syncUpdatedAt 同时覆盖项目元数据、阶段计划和未删除文档。
// 使用关联表最大更新时间可以捕获“只保存章节、没有触碰 Project 行”的常见增量场景，且不需要新增数据库字段。
const syncUpdatedAtSql = Prisma.sql`
  GREATEST(
    p.updated_at,
    COALESCE(
      (SELECT MAX(sp.updated_at) FROM project_stage_plans sp WHERE sp.project_id = p.project_id),
      p.updated_at
    ),
    COALESCE(
      (SELECT MAX(d.updated_at) FROM docs d WHERE d.project_id = p.project_id AND d.is_deleted = FALSE),
      p.updated_at
    )
  )
`

function projectSyncPageQuery(input: OpenProjectListInput) {
  const offset = (input.page - 1) * input.pageSize

  if (input.updatedSince) {
    // 增量拉取按同步时间和项目 ID 升序，调用方处理完全部分页后即可推进时间检查点。
    return Prisma.sql`
      SELECT p.project_id AS projectId, ${syncUpdatedAtSql} AS syncUpdatedAt
      FROM projects p
      WHERE ${syncUpdatedAtSql} > ${input.updatedSince}
      ORDER BY syncUpdatedAt ASC, p.project_id ASC
      LIMIT ${input.pageSize} OFFSET ${offset}
    `
  }

  // 全量列表优先返回最近发生业务变化的项目；项目 ID 作为同一毫秒内的稳定次级排序键。
  return Prisma.sql`
    SELECT p.project_id AS projectId, ${syncUpdatedAtSql} AS syncUpdatedAt
    FROM projects p
    ORDER BY syncUpdatedAt DESC, p.project_id DESC
    LIMIT ${input.pageSize} OFFSET ${offset}
  `
}

function changedProjectWhere(updatedSince: Date | null): Prisma.ProjectWhereInput {
  if (!updatedSince) return {}

  // count 查询必须和上面的 syncUpdatedAt SQL 使用完全相同的数据范围，保证 total 与当前结果集一致。
  return {
    OR: [
      { updatedAt: { gt: updatedSince } },
      { stagePlans: { some: { updatedAt: { gt: updatedSince } } } },
      { docs: { some: { isDeleted: false, updatedAt: { gt: updatedSince } } } },
    ],
  }
}

export async function listOpenProjects(input: OpenProjectListInput): Promise<OpenProjectListResult> {
  // 三次读取放在同一事务快照中，避免分页 ID、total 和详情在并发更新时来自不同数据库时点。
  return prisma.$transaction(async (tx) => {
    const syncRows = await tx.$queryRaw<ProjectSyncRow[]>(projectSyncPageQuery(input))
    const total = await tx.project.count({ where: changedProjectWhere(input.updatedSince) })

    if (syncRows.length === 0) {
      return {
        items: [],
        page: input.page,
        pageSize: input.pageSize,
        total,
        totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
      }
    }

    const projectIds = syncRows.map((row) => row.projectId)
    const projects = await tx.project.findMany({
      where: {
        projectId: {
          in: projectIds,
        },
      },
      include: openProjectInclude,
    })
    const projectById = new Map(projects.map((project) => [project.projectId.toString(), project]))

    // findMany 的 in 查询不保证输入顺序，因此按前置同步查询的稳定顺序重新组装响应。
    const items = syncRows.flatMap((row) => {
      const project = projectById.get(row.projectId.toString())
      return project ? [toOpenProject(project, row.syncUpdatedAt, input.includeChapters)] : []
    })

    return {
      items,
      page: input.page,
      pageSize: input.pageSize,
      total,
      totalPages: Math.max(1, Math.ceil(total / input.pageSize)),
    }
  })
}
