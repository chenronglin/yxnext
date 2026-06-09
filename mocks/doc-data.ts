// 阅享平台 - Doc 编辑器共享 Mock 数据与辅助函数
import type { DocStatus, HolderRole, BadgeTone, Role } from "@/types/domain"
import { DOC_STATUS_LABELS } from "@/types/domain"

// Doc 类型直接对齐真实数据库编码，避免 mock 继续保留 manuscript / qc 别名。
export type DocType = "synopsis" | "outline" | "chapter" | "release"

export const DOC_TYPE_LABELS: Record<DocType, string> = {
  synopsis: "梗概",
  outline: "细纲",
  chapter: "正文",
  release: "质检",
}

export const DOC_STATUS_TONE: Record<DocStatus, BadgeTone> = {
  draft: "neutral",
  submitted: "info",
  returned: "warning",
  approved: "success",
}

export function holderTone(holder: HolderRole): BadgeTone {
  return holder === "author" ? "info" : holder === "editor" ? "warning" : "neutral"
}

// 正文内容块（用普通控件模拟富文本结构）
export interface ContentBlock {
  id: string
  kind: "paragraph" | "heading"
  text: string
  // 协作标记
  revisionMark?: "insert" | "delete" | null
  hasComment?: boolean
}

// 批注
export interface CommentItem {
  id: string
  blockId: string
  preset: "delete" | "replace" | "add" | "normal"
  quote: string
  body: string
  author: string
  role: Role
  createdAt: string
  resolved: boolean
}

// 编辑建议卡片
export interface SuggestionItem {
  id: string
  blockId: string
  title: string
  body: string
  author: string
  createdAt: string
}

// Revision 历史记录
export type RevisionAction = "author_submit" | "editor_return" | "editor_approve"

export const REVISION_ACTION_LABELS: Record<RevisionAction, string> = {
  author_submit: "作者提交",
  editor_return: "编辑退回",
  editor_approve: "编辑通过",
}

export const REVISION_ACTION_TONE: Record<RevisionAction, BadgeTone> = {
  author_submit: "info",
  editor_return: "warning",
  editor_approve: "success",
}

export interface RevisionItem {
  id: string
  version: string
  action: RevisionAction
  operator: string
  operatorRole: Role
  operatedAt: string
  basedOn: string | null
  note: string
  isFinal: boolean
  contentHash: string
}

export interface DocData {
  id: string
  projectId: string
  projectName: string
  docType: DocType
  title: string
  status: DocStatus
  holder: HolderRole
  words: number
  lastSavedAt: string
  lockVersion: number
  // 当前持有人姓名（用于只读提示）
  holderName: string
  // 作者/编辑提交说明
  submitNote: string
  // 最近退回说明
  returnNote: string
  blocks: ContentBlock[]
  comments: CommentItem[]
  suggestions: SuggestionItem[]
  revisions: RevisionItem[]
}

// 演示 Doc：每个 projectId + docType 组合
const SAMPLE_BLOCKS: ContentBlock[] = [
  { id: "b1", kind: "heading", text: "第四章 暗巷的修士" },
  {
    id: "b2",
    kind: "paragraph",
    text: "夜色压下来时，林川刚送完今天的第三十七单。电动车的电量只剩一格，他靠在墙边喘了口气，功德值面板在视野角落静静闪烁。",
    hasComment: true,
  },
  {
    id: "b3",
    kind: "paragraph",
    text: "巷子深处传来一声闷响。他本能地想绕开，脚却像被钉在原地——那是一股久违的灵气波动，和他前世感知到的一模一样。",
    revisionMark: "insert",
  },
  {
    id: "b4",
    kind: "paragraph",
    text: "「外卖到了吗？」沙哑的声音从黑暗里传来。林川握紧保温箱，慢慢点头，指尖却已凝起一缕微不可察的剑意。",
    hasComment: true,
  },
  {
    id: "b5",
    kind: "paragraph",
    text: "这一段冲突铺垫稍显仓促，节奏可以再放缓半拍，让读者先感受到危险，再让主角出手。",
    revisionMark: "delete",
  },
]

const SAMPLE_COMMENTS: CommentItem[] = [
  {
    id: "cm1",
    blockId: "b2",
    preset: "normal",
    quote: "功德值面板在视野角落静静闪烁",
    body: "这里可以补一句面板的具体数值，让系统感更强。",
    author: "林编辑",
    role: "editor",
    createdAt: "2026-06-08 10:12",
    resolved: false,
  },
  {
    id: "cm2",
    blockId: "b4",
    preset: "replace",
    quote: "慢慢点头",
    body: "此处替换为：喉结滚动了一下，才勉强点头",
    author: "林编辑",
    role: "editor",
    createdAt: "2026-06-08 10:15",
    resolved: false,
  },
  {
    id: "cm3",
    blockId: "b5",
    preset: "delete",
    quote: "这一段冲突铺垫稍显仓促",
    body: "此处删除：建议整段重写，参考前文节奏。",
    author: "林编辑",
    role: "editor",
    createdAt: "2026-06-08 10:18",
    resolved: false,
  },
]

const SAMPLE_SUGGESTIONS: SuggestionItem[] = [
  {
    id: "sg1",
    blockId: "b3",
    title: "强化感官描写",
    body: "灵气波动可以加入嗅觉或体感细节，例如皮肤发麻、空气变冷，增强代入感。",
    author: "林编辑",
    createdAt: "2026-06-08 10:20",
  },
  {
    id: "sg2",
    blockId: "b4",
    title: "埋设伏笔",
    body: "这位修士的身份建议在此处留一个钩子，为后续功德商城剧情做铺垫。",
    author: "林编辑",
    createdAt: "2026-06-08 10:22",
  },
]

const SAMPLE_REVISIONS: RevisionItem[] = [
  {
    id: "r1",
    version: "R1",
    action: "author_submit",
    operator: "苏小白",
    operatorRole: "author",
    operatedAt: "2026-06-06 14:20",
    basedOn: null,
    note: "第四章初稿，主角与神秘修士初次相遇，请老师把关节奏。",
    isFinal: false,
    contentHash: "a1b2c3d4",
  },
  {
    id: "r2",
    version: "R2",
    action: "editor_return",
    operator: "林编辑",
    operatorRole: "editor",
    operatedAt: "2026-06-07 09:40",
    basedOn: "R1",
    note: "中段冲突铺垫偏快，已添加 3 处批注与 2 条建议，请据此修改后再提交。",
    isFinal: false,
    contentHash: "e5f6a7b8",
  },
  {
    id: "r3",
    version: "R3",
    action: "author_submit",
    operator: "苏小白",
    operatorRole: "author",
    operatedAt: "2026-06-08 09:30",
    basedOn: "R2",
    note: "已按建议放缓节奏，补充感官描写，请老师复审。",
    isFinal: false,
    contentHash: "c9d0e1f2",
  },
]

// 根据 projectId 和 docType 构造一个 Doc（演示数据）
export function getDoc(projectId: string, docType: DocType): DocData {
  const projectNames: Record<string, string> = {
    p1: "都市修真：外卖小哥的逆袭",
    p2: "锦衣探案录",
    p3: "星海拾遗",
    p4: "山海食肆",
    p5: "长安十二楼",
    p6: "雾隐山庄",
  }
  return {
    id: `${projectId}-${docType}`,
    projectId,
    projectName: projectNames[projectId] ?? "未知项目",
    docType,
    // 正文章节仍然显示具体章节名；其它 Doc 使用阶段标签作为标题。
    title: docType === "chapter" ? "第四章 暗巷的修士" : DOC_TYPE_LABELS[docType],
    status: "submitted",
    holder: "editor",
    words: 3680,
    lastSavedAt: "2026-06-08 14:32",
    lockVersion: 7,
    holderName: "林编辑",
    submitNote: "已按建议放缓节奏，补充感官描写，请老师复审。",
    returnNote: "中段冲突铺垫偏快，请加强危险感的逐步释放。",
    blocks: SAMPLE_BLOCKS,
    comments: SAMPLE_COMMENTS,
    suggestions: SAMPLE_SUGGESTIONS,
    revisions: SAMPLE_REVISIONS,
  }
}

export function getRevision(projectId: string, docType: DocType, revisionId: string): RevisionItem | undefined {
  return getDoc(projectId, docType).revisions.find((r) => r.id === revisionId)
}

export { DOC_STATUS_LABELS }
