import type { SiStatus, BadgeTone } from "./types"

export const SI_STATUS_TONE: Record<SiStatus, BadgeTone> = {
  draft: "neutral",
  prereleased: "info",
  converted: "success",
  archived: "warning",
}

export type PrereleaseStatus = "active" | "withdrawn" | "converted"

export const PRERELEASE_STATUS_LABELS: Record<PrereleaseStatus, string> = {
  active: "预发中",
  withdrawn: "已收回",
  converted: "已转项目",
}

export const PRERELEASE_STATUS_TONE: Record<PrereleaseStatus, BadgeTone> = {
  active: "info",
  withdrawn: "neutral",
  converted: "success",
}

export interface PrereleaseRecord {
  id: string
  siId: string
  siTitle: string
  authorId: string
  authorName: string
  editorName: string
  note: string
  status: PrereleaseStatus
  prereleasedAt: string
  projectId?: string
  projectName?: string
}

export interface SiVersion {
  version: number
  savedBy: string
  savedAt: string
  note?: string
  current: boolean
  title: string
  mainType: string
  trope: string
  freshTwist: string
  synopsis: string
}

export interface SiItem {
  id: string
  title: string
  mainType: string
  trope: string
  benchmark: string
  authors: string[]
  remark: string
  freshTwist: string
  synopsis: string
  status: SiStatus
  createdBy: string
  createdAt: string
  updatedAt: string
  prereleaseCount: number
  converted: boolean
}

export const MAIN_TYPES = ["都市言情", "古代言情", "玄幻奇幻", "悬疑推理", "科幻末世", "历史架空", "现实题材"]

export const BOUND_AUTHORS = [
  { id: "a1", name: "苏小白" },
  { id: "a2", name: "周野" },
  { id: "a3", name: "云深" },
  { id: "a4", name: "顾辞" },
]

export const SI_LIST: SiItem[] = [
  {
    id: "si1",
    title: "都市修真：外卖小哥的逆袭",
    mainType: "玄幻奇幻",
    trope: "马甲爽文 / 扮猪吃虎",
    benchmark: "《我的微信连三界》",
    authors: ["苏小白", "周野"],
    remark: "节奏要快，前三章必须出爽点。",
    freshTwist: "修真者重生为都市外卖员，靠送餐积累功德值重修仙途。",
    synopsis:
      "上古剑修陨落后转世于现代都市，记忆封印未解，只能以外卖骑手为生。某次送餐途中触发功德系统，开启边送餐边修炼的逆袭之路……",
    status: "prereleased",
    createdBy: "林编辑",
    createdAt: "2026-05-28 14:20",
    updatedAt: "2026-06-07 09:00",
    prereleaseCount: 2,
    converted: false,
  },
  {
    id: "si2",
    title: "长夜未央",
    mainType: "悬疑推理",
    trope: "双线叙事 / 暴风雪山庄",
    benchmark: "《无人生还》",
    authors: ["云深"],
    remark: "强调氛围感与反转密度。",
    freshTwist: "凶手与侦探共享同一段被篡改的记忆。",
    synopsis: "一座与世隔绝的疗养院，七名访客接连离奇死亡，唯一的幸存者却失去了案发当晚的全部记忆……",
    status: "converted",
    createdBy: "林编辑",
    createdAt: "2026-05-10 11:00",
    updatedAt: "2026-05-30 16:40",
    prereleaseCount: 1,
    converted: true,
  },
  {
    id: "si3",
    title: "雾中灯塔",
    mainType: "现实题材",
    trope: "治愈 / 群像",
    benchmark: "《岛上书店》",
    authors: [],
    remark: "",
    freshTwist: "一座废弃灯塔成为小镇居民的情感中转站。",
    synopsis: "海边小镇的老灯塔即将被拆除，守塔人决定在最后一个月里，为每位来访者点亮一盏灯……",
    status: "draft",
    createdBy: "林编辑",
    createdAt: "2026-06-02 10:15",
    updatedAt: "2026-06-08 18:30",
    prereleaseCount: 0,
    converted: false,
  },
  {
    id: "si4",
    title: "青衫记",
    mainType: "古代言情",
    trope: "先婚后爱 / 朝堂权谋",
    benchmark: "《知否知否》",
    authors: ["顾辞"],
    remark: "已完结归档，备查。",
    freshTwist: "联姻新娘其实是敌国安插的细作，却在朝堂博弈中动了真情。",
    synopsis: "权臣之女奉旨下嫁寒门御史，一桩政治联姻牵出二十年前的旧案……",
    status: "archived",
    createdBy: "林编辑",
    createdAt: "2026-03-18 09:30",
    updatedAt: "2026-04-22 14:00",
    prereleaseCount: 1,
    converted: false,
  },
]

export const PRERELEASE_RECORDS: PrereleaseRecord[] = [
  {
    id: "pr1",
    siId: "si1",
    siTitle: "都市修真：外卖小哥的逆袭",
    authorId: "a1",
    authorName: "苏小白",
    editorName: "林编辑",
    note: "你之前写过同类型马甲文，这个选题很适合你，看看有没有兴趣。",
    status: "active",
    prereleasedAt: "2026-06-05 15:20",
  },
  {
    id: "pr2",
    siId: "si1",
    siTitle: "都市修真：外卖小哥的逆袭",
    authorId: "a2",
    authorName: "周野",
    editorName: "林编辑",
    note: "节奏型选题，期待你的开篇。",
    status: "active",
    prereleasedAt: "2026-06-06 10:05",
  },
  {
    id: "pr3",
    siId: "si2",
    siTitle: "长夜未央",
    authorId: "a3",
    authorName: "云深",
    editorName: "林编辑",
    note: "悬疑功底强，直接推进。",
    status: "converted",
    prereleasedAt: "2026-05-22 09:30",
    projectId: "p2",
    projectName: "长夜未央",
  },
  {
    id: "pr4",
    siId: "si4",
    siTitle: "青衫记",
    authorId: "a4",
    authorName: "顾辞",
    editorName: "林编辑",
    note: "古言权谋，先看大纲。",
    status: "withdrawn",
    prereleasedAt: "2026-03-25 14:10",
  },
]

export const SI_VERSIONS: SiVersion[] = [
  {
    version: 3,
    savedBy: "林编辑",
    savedAt: "2026-06-07 09:00",
    note: "预发前定稿，补充 Fresh Twist。",
    current: true,
    title: "都市修真：外卖小哥的逆袭",
    mainType: "玄幻奇幻",
    trope: "马甲爽文 / 扮猪吃虎",
    freshTwist: "修真者重生为都市外卖员，靠送餐积累功德值重修仙途。",
    synopsis:
      "上古剑修陨落后转世于现代都市，记忆封印未解，只能以外卖骑手为生。某次送餐途中触发功德系统，开启边送餐边修炼的逆袭之路……",
  },
  {
    version: 2,
    savedBy: "林编辑",
    savedAt: "2026-06-03 16:42",
    note: "调整主类型与对标书目。",
    current: false,
    title: "都市修真：外卖小哥",
    mainType: "玄幻奇幻",
    trope: "马甲爽文",
    freshTwist: "重生剑修在都市送外卖时觉醒功德系统。",
    synopsis: "上古剑修转世现代，以外卖骑手身份重新修炼……",
  },
  {
    version: 1,
    savedBy: "林编辑",
    savedAt: "2026-05-28 14:20",
    note: "初始草稿。",
    current: false,
    title: "都市修真",
    mainType: "都市言情",
    trope: "爽文",
    freshTwist: "修真者重生都市。",
    synopsis: "一个剑修转世到现代都市的故事。",
  },
]

export function getSiById(id: string): SiItem | undefined {
  return SI_LIST.find((s) => s.id === id)
}

// 作者视角的 SI 视图（基于预发给该作者的记录）
export interface AuthorSiView {
  recordId: string
  siId: string
  title: string
  mainType: string
  trope: string
  benchmark: string
  remark: string
  freshTwist: string
  synopsis: string
  editorName: string
  note: string
  status: Exclude<PrereleaseStatus, "withdrawn">
  prereleasedAt: string
  projectId?: string
  projectName?: string
  projectStage?: string
}

// 当前登录作者（演示用，假定为「苏小白」/ a1）
export const CURRENT_AUTHOR_ID = "a1"

export const MY_SI_VIEWS: AuthorSiView[] = [
  {
    recordId: "pr1",
    siId: "si1",
    title: "都市修真：外卖小哥的逆袭",
    mainType: "玄幻奇幻",
    trope: "马甲爽文 / 扮猪吃虎",
    benchmark: "《我的微信连三界》",
    remark: "节奏要快，前三章必须出爽点。",
    freshTwist: "修真者重生为都市外卖员，靠送餐积累功德值重修仙途。",
    synopsis:
      "上古剑修陨落后转世于现代都市，记忆封印未解，只能以外卖骑手为生。某次送餐途中触发功德系统，开启边送餐边修炼的逆袭之路……",
    editorName: "林编辑",
    note: "你之前写过同类型马甲文，这个选题很适合你，看看有没有兴趣。",
    status: "active",
    prereleasedAt: "2026-06-05 15:20",
  },
  {
    recordId: "pr-mine-2",
    siId: "si5",
    title: "星海拾遗",
    mainType: "科幻末世",
    trope: "废土 / 拾荒者",
    benchmark: "《球状闪电》",
    remark: "世界观需要扎实的科学设定。",
    freshTwist: "末世幸存者靠回收旧时代的记忆芯片维生，却逐渐拼凑出灾难真相。",
    synopsis: "全球数据网络崩溃后的第十年，一名记忆拾荒者在废墟中发现了一枚尚未损毁的核心芯片……",
    editorName: "林编辑",
    note: "这个项目已经为你立项，可以直接进入梗概阶段开始创作。",
    status: "converted",
    prereleasedAt: "2026-05-18 10:40",
    projectId: "p5",
    projectName: "星海拾遗",
    projectStage: "梗概",
  },
]

export function getMySiByRecord(recordId: string): AuthorSiView | undefined {
  return MY_SI_VIEWS.find((v) => v.recordId === recordId)
}
