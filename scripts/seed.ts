import { existsSync, readFileSync } from "node:fs"
import { resolve } from "node:path"

import bcrypt from "bcryptjs"
import { PrismaMariaDb } from "@prisma/adapter-mariadb"
import { PrismaClient, type Role, type User, type UserStatus } from "@prisma/client"

type SeedAccount = {
  username: string
  password: string
  role: Role
  email: string
  displayName: string
  biography: string
  phone?: string | null
}

const baseAccounts: SeedAccount[] = [
  {
    username: "admin",
    password: "admin00000",
    role: "admin",
    email: "admin@example.com",
    displayName: "管理员测试账号",
    biography: "系统管理员测试账号，用于后台治理、审批和全局排查。",
    phone: null,
  },
  {
    username: "editor",
    password: "editor00000",
    role: "editor",
    email: "editor@example.com",
    displayName: "编辑测试账号",
    biography: "基础编辑测试账号，用于项目推进、审稿和质检流转。",
    phone: null,
  },
  {
    username: "author",
    password: "author00000",
    role: "author",
    email: "author@example.com",
    displayName: "作者测试账号",
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
  return `${username}+${role}@example.com`
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
  const prisma = createPrismaClient()

  try {
    const accounts = dedupeAccounts([...baseAccounts, ...buildExtraAccounts()])
    const adminAccount = accounts.find((account) => account.role === "admin")

    if (!adminAccount) {
      throw new Error("seed 配置缺少管理员账号")
    }

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

    console.log(`Seed 完成，共同步 ${seededUsers.length} 个测试账号。`)
    console.table(seededUsers.map((item) => toSummaryRow(item.user, item.password)))
  } finally {
    // 脚本模式下必须显式断开连接，避免 Node 进程因为 Prisma 连接池残留而挂住。
    await prisma.$disconnect()
  }
}

void main().catch((error) => {
  console.error("Seed 执行失败：", error)
  process.exitCode = 1
})
