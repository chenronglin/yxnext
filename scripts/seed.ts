import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import bcrypt from "bcryptjs"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient, type Role, type StageCode, type User, type UserStatus } from "@prisma/client"

type SeedAccount = {
  username: string
  password: string
  role: Role
  email: string
  displayName: string
  biography: string
  phone?: string | null
}

// SI 主类型是当前参数管理页仍然保留的基础参数；
// 这里使用独立类型约束初始化字段，避免误把旧系统的子类型配置带回来。
type SeedSiMainType = {
  code: string
  name: string
  sortOrder: number
  isActive: boolean
}

// 阶段计划默认值只服务“转项目后生成阶段计划”的系统参数；
// 它不代表实际项目数据，因此 seed 时只写默认配置表。
type SeedStagePlanDefault = {
  stageCode: StageCode
  defaultPlanDays: number
  warningDaysBeforeDue: number
}

// 默认绑定只建立编辑和作者之间的可见关系；
// 该关系用于后续手工创建 SI 时选择作者，不会自动创建任何 SI 或项目。
type SeedBinding = {
  editorUsername: string
  authorUsername: string
  note: string
}

const baseAccounts: SeedAccount[] = [
  {
    username: "admin",
    password: "Admin@123456",
    role: "admin",
    email: "admin@test.com",
    displayName: "系统管理员",
    biography: "系统管理员测试账号，用于后台治理、审批和全局排查。",
    phone: null,
  },
  {
    username: "editor",
    password: "Editor@123456",
    role: "editor",
    email: "editor@test.com",
    displayName: "测试编辑",
    biography: "基础编辑测试账号，用于项目推进、审稿和质检流转。",
    phone: null,
  },
  {
    username: "author",
    password: "Author@123456",
    role: "author",
    email: "author@test.com",
    displayName: "测试作者",
    biography: "基础作者测试账号，用于注册、投稿、退回修改和项目协作测试。",
    phone: null,
  },
] as const

const extraAuthorAccounts = [
  {
    username: "helele",
    password: "hll00000",
  },
  {
    username: "zhangqin",
    password: "zq00000",
  },
  {
    username: "hanshuyu",
    password: "hsy00000",
  },
  {
    username: "wangyining",
    password: "wyn00000",
  },
] as const

const extraEditorAccounts = [
  {
    username: "duanrunqiu",
    password: "drq00000",
  },
  {
    username: "dengyandan",
    password: "dyd00000",
  },
  {
    username: "zhangziping",
    password: "zzp00000",
  },
  {
    username: "huangrou",
    password: "hr00000",
  },
] as const

// 参考旧 seed 中仍有业务价值的主类型候选值，只保留当前系统支持的“主类型”维度。
const seedSiMainTypes: SeedSiMainType[] = [
  {
    code: "狼人文",
    name: "狼人文",
    sortOrder: 10,
    isActive: true,
  },
  {
    code: "黑手党文",
    name: "黑手党文",
    sortOrder: 20,
    isActive: true,
  },
  {
    code: "追妻文",
    name: "追妻文",
    sortOrder: 30,
    isActive: true,
  },
] as const

// 与服务层转项目 fallback 保持一致，保证数据库初始化后和无配置时的行为一致。
const seedStagePlanDefaults: SeedStagePlanDefault[] = [
  {
    stageCode: "synopsis",
    defaultPlanDays: 5,
    warningDaysBeforeDue: 1,
  },
  {
    stageCode: "outline",
    defaultPlanDays: 7,
    warningDaysBeforeDue: 1,
  },
  {
    stageCode: "chapter",
    defaultPlanDays: 30,
    warningDaysBeforeDue: 1,
  },
  {
    stageCode: "release",
    defaultPlanDays: 7,
    warningDaysBeforeDue: 1,
  },
] as const

// 只给默认 editor 和 author 建立一条基础绑定，方便新环境直接验证预发作者选择。
const seedBindings: SeedBinding[] = [
  {
    editorUsername: "editor",
    authorUsername: "author",
    note: "种子默认绑定：用于验证 SI 预发作者选择、项目协作和待办流转。",
  },
] as const

const applicationTableNames = [
  "user_sessions",
  "editor_author_bindings",
  "story_idea_fit_authors",
  "si_preissues",
  "story_idea_versions",
  "story_ideas",
  "release_source_revisions",
  "doc_revisions",
  "doc_current_drafts",
  "docs",
  "project_assignment_logs",
  "project_stage_plans",
  "projects",
  "notifications",
  "todo_items",
  "operation_logs",
  "export_jobs",
  "stage_plan_defaults",
  "si_main_types",
  "users",
] as const

const autoIncrementTableNames = [
  "users",
  "editor_author_bindings",
  "si_main_types",
  "story_ideas",
  "story_idea_versions",
  "si_preissues",
  "projects",
  "project_stage_plans",
  "project_assignment_logs",
  "docs",
  "doc_current_drafts",
  "doc_revisions",
  "release_source_revisions",
  "notifications",
  "todo_items",
  "operation_logs",
  "export_jobs",
] as const

function loadEnvFile(filePath: string, overrideExisting = false) {
  if (!existsSync(filePath)) {
    return
  }

  const content = readFileSync(filePath, "utf8")

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim()

    // 只处理最常见的 KEY=VALUE 形式；注释和空行直接跳过，保证脚本足够稳。
    if (!line || line.startsWith("#")) {
      continue
    }

    const separatorIndex = line.indexOf("=")
    if (separatorIndex <= 0) {
      continue
    }

    const key = line.slice(0, separatorIndex).trim()
    const rawValue = line.slice(separatorIndex + 1).trim()
    const value = rawValue.replace(/^['"]|['"]$/g, "")

    // 只在当前进程里补充尚未设置的环境变量，避免覆盖外部显式传入的配置。
    if (overrideExisting || !(key in process.env)) {
      process.env[key] = value
    }
  }
}

function ensureDatabaseUrl() {
  // 脚本独立运行时不会自动像 Next.js 那样注入 .env，因此这里手动补一次。
  loadEnvFile(resolve(process.cwd(), ".env"))
  loadEnvFile(resolve(process.cwd(), ".env.local"), true)

  if (!process.env.DATABASE_URL) {
    throw new Error("缺少 DATABASE_URL，无法执行 seed")
  }
}

function createPrismaClient() {
  ensureDatabaseUrl()

  // 与应用运行时保持同一套 MariaDB adapter，避免脚本和服务端连接方式不一致。
  const adapter = new PrismaMariaDb(process.env.DATABASE_URL!)

  return new PrismaClient({
    adapter,
    log: ["error", "warn"],
  })
}

function makeSeedEmail(username: string, role: Exclude<Role, "admin">) {
  // 额外测试账号没有指定邮箱，这里按稳定规则生成，保证可重复执行且满足唯一约束。
  // 邮箱域名与参考种子保持一致；role 后缀用于防止未来同名跨角色账号撞唯一索引。
  return `${username}+${role}@test.com`
}

function buildExtraAccounts(): SeedAccount[] {
  const authors = extraAuthorAccounts.map((account) => ({
    username: account.username,
    password: account.password,
    role: "author" as const,
    email: makeSeedEmail(account.username, "author"),
    displayName: account.username,
    biography: "批量注入的作者测试账号，用于项目协作、待办和通知回归测试。",
    phone: null,
  }))

  const editors = extraEditorAccounts.map((account) => ({
    username: account.username,
    password: account.password,
    role: "editor" as const,
    email: makeSeedEmail(account.username, "editor"),
    displayName: account.username,
    biography: "批量注入的编辑测试账号，用于选题预发、审稿和项目治理回归测试。",
    phone: null,
  }))

  return [...authors, ...editors]
}

function dedupeAccounts(accounts: SeedAccount[]) {
  const accountMap = new Map<string, SeedAccount>()

  for (const account of accounts) {
    if (accountMap.has(account.username)) {
      throw new Error(`seed 配置中存在重复用户名：${account.username}`)
    }

    accountMap.set(account.username, account)
  }

  return [...accountMap.values()]
}

function passwordEnvKey(username: string) {
  return `SEED_PASSWORD_${username.toUpperCase().replace(/[^A-Z0-9]+/g, "_")}`
}

function applyPasswordOverrides(account: SeedAccount): SeedAccount {
  const envKey = passwordEnvKey(account.username)
  const password = process.env[envKey]?.trim()

  // 开发环境可以继续使用脚本内默认密码；
  // 部署或共享环境应通过 SEED_PASSWORD_<USERNAME> 注入更强的一次性密码。
  return password ? { ...account, password } : account
}

async function upsertUser(prisma: PrismaClient, account: SeedAccount, adminUserId: bigint | null) {
  const passwordHash = await bcrypt.hash(account.password, 10)
  const now = new Date()
  const status: UserStatus = "active"

  // 这里故意做“覆盖式 seed”：
  // 只要用户名一致，就把密码、邮箱、角色和资料同步回脚本配置，确保每次执行后账号状态可预测。
  return prisma.user.upsert({
    where: {
      username: account.username,
    },
    update: {
      email: account.email,
      passwordHash,
      role: account.role,
      status,
      displayName: account.displayName,
      phone: account.phone ?? null,
      biography: account.biography,
      rejectedReason: null,
      approvedBy: account.role === "admin" ? null : adminUserId,
      approvedAt: account.role === "admin" ? null : now,
    },
    create: {
      username: account.username,
      email: account.email,
      passwordHash,
      role: account.role,
      status,
      displayName: account.displayName,
      phone: account.phone ?? null,
      biography: account.biography,
      approvedBy: account.role === "admin" ? null : adminUserId,
      approvedAt: account.role === "admin" ? null : now,
    },
  })
}

function quoteTableName(tableName: string) {
  if (!/^[a-z_]+$/.test(tableName)) {
    throw new Error(`非法数据表名：${tableName}`)
  }

  return `\`${tableName}\``
}

async function resetDatabaseTables(prisma: PrismaClient) {
  // seed 的职责是把当前库恢复为一份干净的初始化数据；
  // 因此这里清空所有 Prisma schema 管理的业务表，但保留迁移元数据表，避免破坏迁移状态。
  await prisma.$transaction(async (tx) => {
    // 先断开少量循环引用和可选回指，再按子表到父表的顺序删除，避免依赖数据库连接级外键开关。
    await tx.doc.updateMany({
      data: {
        activeDraftId: null,
        latestRevisionId: null,
        finalRevisionId: null,
      },
    })
    await tx.docCurrentDraft.updateMany({
      data: {
        baseRevisionId: null,
      },
    })
    await tx.docRevision.updateMany({
      data: {
        baseRevisionId: null,
      },
    })
    await tx.storyIdea.updateMany({
      data: {
        latestVersionId: null,
      },
    })
    await tx.storyIdeaVersion.updateMany({
      data: {
        rollbackFromVersionId: null,
      },
    })
    await tx.siPreissue.updateMany({
      data: {
        projectId: null,
      },
    })

    await tx.exportJob.deleteMany()
    await tx.operationLog.deleteMany()
    await tx.todoItem.deleteMany()
    await tx.notification.deleteMany()
    await tx.releaseSourceRevision.deleteMany()
    await tx.docRevision.deleteMany()
    await tx.docCurrentDraft.deleteMany()
    await tx.doc.deleteMany()
    await tx.projectAssignmentLog.deleteMany()
    await tx.projectStagePlan.deleteMany()
    await tx.project.deleteMany()
    await tx.siPreissue.deleteMany()
    await tx.storyIdeaFitAuthor.deleteMany()
    await tx.storyIdeaVersion.deleteMany()
    await tx.storyIdea.deleteMany()
    await tx.editorAuthorBinding.deleteMany()
    await tx.userSession.deleteMany()
    await tx.stagePlanDefault.deleteMany()
    await tx.siMainType.deleteMany()
    await tx.user.deleteMany()
  })

  for (const tableName of autoIncrementTableNames) {
    // 表名来自脚本内白名单，quoteTableName 会再做一次格式兜底校验。
    await prisma.$executeRawUnsafe(`ALTER TABLE ${quoteTableName(tableName)} AUTO_INCREMENT = 1`)
  }

  return applicationTableNames.length
}

function makeActiveBindingKey(authorId: bigint) {
  // 当前业务约束是一位作者同一时间只能绑定一个活动编辑；
  // 唯一键只使用 authorId，可以让数据库兜底拦住并发写入产生的多编辑绑定。
  return authorId.toString()
}

async function resolveSeedUserMap(prisma: PrismaClient, usernames: string[]) {
  // 后续绑定初始化只依赖 username，因此先批量查出账号 ID，避免在循环里重复访问数据库。
  const users = await prisma.user.findMany({
    where: {
      username: {
        in: usernames,
      },
    },
    select: {
      userId: true,
      username: true,
      role: true,
    },
  })

  return new Map(users.map((user) => [user.username, user]))
}

async function upsertSeedBinding(prisma: PrismaClient, binding: SeedBinding, adminUserId: bigint) {
  const userMap = await resolveSeedUserMap(prisma, [binding.editorUsername, binding.authorUsername])
  const editor = userMap.get(binding.editorUsername)
  const author = userMap.get(binding.authorUsername)

  if (!editor || editor.role !== "editor") {
    throw new Error(`seed 绑定缺少编辑账号或角色不正确：${binding.editorUsername}`)
  }

  if (!author || author.role !== "author") {
    throw new Error(`seed 绑定缺少作者账号或角色不正确：${binding.authorUsername}`)
  }

  // 同一作者只保留一条活动绑定；如果已经存在活动记录，就更新编辑、操作人和备注。
  // 这里不创建任何 SI 或项目数据，只提供预发流程所需的基础作者可见关系。
  return prisma.editorAuthorBinding.upsert({
    where: {
      activePairKey: makeActiveBindingKey(author.userId),
    },
    update: {
      editorId: editor.userId,
      authorId: author.userId,
      status: "active",
      boundBy: adminUserId,
      unboundBy: null,
      unboundAt: null,
      note: binding.note,
    },
    create: {
      editorId: editor.userId,
      authorId: author.userId,
      status: "active",
      boundBy: adminUserId,
      note: binding.note,
      activePairKey: makeActiveBindingKey(author.userId),
    },
  })
}

async function seedMainTypes(prisma: PrismaClient) {
  // 只初始化当前系统仍在使用的 SI 主类型参数；
  // 旧系统的子类型参数已被移除，不能再写入任何子类型配置。
  for (const mainType of seedSiMainTypes) {
    await prisma.siMainType.upsert({
      where: {
        code: mainType.code,
      },
      update: {
        name: mainType.name,
        sortOrder: mainType.sortOrder,
        isActive: mainType.isActive,
      },
      create: {
        code: mainType.code,
        name: mainType.name,
        sortOrder: mainType.sortOrder,
        isActive: mainType.isActive,
      },
    })
  }
}

async function seedStagePlans(prisma: PrismaClient, adminUserId: bigint) {
  // 阶段默认天数是转项目时生成项目阶段计划的基础参数；
  // 这里只写默认值，不创建任何实际项目或稿件文档。
  for (const plan of seedStagePlanDefaults) {
    await prisma.stagePlanDefault.upsert({
      where: {
        stageCode: plan.stageCode,
      },
      update: {
        defaultPlanDays: plan.defaultPlanDays,
        warningDaysBeforeDue: plan.warningDaysBeforeDue,
        updatedBy: adminUserId,
      },
      create: {
        stageCode: plan.stageCode,
        defaultPlanDays: plan.defaultPlanDays,
        warningDaysBeforeDue: plan.warningDaysBeforeDue,
        updatedBy: adminUserId,
      },
    })
  }
}

function toSummaryRow(user: User, password: string) {
  return {
    username: user.username,
    role: user.role,
    status: user.status,
    email: user.email,
    password,
  }
}

async function main() {
  if (process.env.NODE_ENV === "production" && !process.argv.includes("--force")) {
    throw new Error("生产环境执行 seed 必须显式传入 --force，避免误植入测试账号")
  }

  const prisma = createPrismaClient()

  try {
    const accounts = dedupeAccounts([...baseAccounts, ...buildExtraAccounts()].map(applyPasswordOverrides))
    const adminAccount = accounts.find((account) => account.role === "admin")

    if (!adminAccount) {
      throw new Error("seed 配置缺少管理员账号")
    }

    const resetTableCount = await resetDatabaseTables(prisma)
    const adminUser = await upsertUser(prisma, adminAccount, null)
    const seededUsers: Array<{ user: User; password: string }> = [
      {
        user: adminUser,
        password: adminAccount.password,
      },
    ]

    for (const account of accounts) {
      if (account.username === adminAccount.username) {
        continue
      }

      const user = await upsertUser(prisma, account, adminUser.userId)
      seededUsers.push({
        user,
        password: account.password,
      })
    }

    await seedMainTypes(prisma)
    await seedStagePlans(prisma, adminUser.userId)

    for (const binding of seedBindings) {
      await upsertSeedBinding(prisma, binding, adminUser.userId)
    }

    console.log(`Seed 完成，共同步 ${seededUsers.length} 个测试账号。`)
    console.table(seededUsers.map((item) => toSummaryRow(item.user, item.password)))
    console.log(
      `基础参数完成：${seedSiMainTypes.length} 个 SI 主类型、${seedStagePlanDefaults.length} 个阶段计划默认值、${seedBindings.length} 条编辑作者绑定。`,
    )
    console.log(`已清空 ${resetTableCount} 张业务表后重新插入种子数据。`)
  } finally {
    // 脚本模式下必须显式断开连接，避免 Node 进程因为 Prisma 连接池残留而挂住。
    await prisma.$disconnect()
  }
}

void main().catch((error) => {
  console.error("Seed 执行失败：", error)
  process.exitCode = 1
})
