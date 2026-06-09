import type { Role, UserStatus } from "@/types/domain"

// 个人设置页真正需要的资料只包含当前数据库已有且允许本人维护的字段，
// 因此这里不暴露审批、会话等治理字段，避免前端误以为这些数据可由本人编辑。
export interface AccountProfile {
  id: string
  username: string
  name: string
  role: Role
  status: UserStatus
  email: string
  phone: string | null
  biography: string | null
  avatarUrl: string | null
}

// 绑定信息接口按角色返回不同摘要：作者更关心“我绑定了哪些编辑”，
// 编辑更关心“我当前绑定了多少作者”，管理员则明确返回“不参与绑定”。
export interface AccountBindingInfo {
  role: Role
  editors: Array<{
    id: string
    name: string
  }>
  authors: Array<{
    id: string
    name: string
  }>
  authorCount: number
  editorCount: number
}

// 注册接口返回最小结果即可：申请已创建、账号当前状态是什么。
// 这样登录页和账号状态页后续都能直接复用这一份状态值。
export interface RegisterAccountResult {
  userId: string
  status: UserStatus
}
