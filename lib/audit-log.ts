// 审计日志在数据库中保存稳定的英文动作编码，页面展示时再统一转换为中文。
// 映射集中维护可以避免表格、筛选项和详情弹窗分别实现后出现文案不一致。
const AUDIT_ACTION_LABELS: Readonly<Record<string, string>> = {
  "account.profile.update": "更新个人资料",
  "account.locale.update": "切换界面语言",
  "account.password.update": "修改账号密码",
  "auth.register": "提交注册申请",
  "auth.forgot_password.request": "申请找回密码",
  "doc.save": "保存文档",
  "doc.submit": "提交文档审核",
  "doc.return": "退回文档修改",
  "doc.approve": "通过文档审核",
  "doc.cancel_approval": "取消文档定稿",
  "open.content.read": "读取 Open API 正文",
  author_submit: "作者提交审核",
  editor_reject: "编辑退回修改",
  editor_approve: "编辑审核通过",
  "si.create": "创建 SI",
  "si.update": "更新 SI",
  "si.title.update": "修改 SI 标题",
  "si.prepublish": "预发 SI",
  "si.rollback": "回滚 SI 版本",
  "si.archive": "归档 SI",
  "si.delete": "删除 SI",
  "si_preissue.withdraw": "撤回 SI 预发",
  "si_preissue.withdraw_by_si_delete": "删除 SI 并撤回预发",
  "si_preissue.convert_to_project": "SI 转为项目",
  "project.title.update": "更新项目标题",
  "project.chapter.create": "新建项目章节",
  "project.chapter.reorder": "调整章节顺序",
  "project.chapter.metadata.update": "更新章节信息",
  "project.chapter.delete": "删除项目章节",
  "project.qc.unlock": "解锁项目质检",
  "project.qc.regenerate": "重新生成项目质检",
  "project.complete": "完成项目",
  "admin.user.create": "创建用户",
  "admin.user.update": "更新用户",
  "admin.user.reset_password": "重置用户密码",
  "admin.approval.approve": "通过注册审批",
  "admin.approval.reject": "拒绝注册审批",
  "admin.binding.create": "创建编辑作者绑定",
  "admin.binding.unbind": "解除编辑作者绑定",
  "admin.param.si_main_type.create": "新建 SI 主类型",
  "admin.param.si_main_type.update": "更新 SI 主类型",
  "admin.param.stage_plan_defaults.update": "更新阶段默认计划",
  "admin.project.assignment.update": "调整项目分配",
  "admin.project.stage_plans.update": "更新项目阶段计划",
  "admin.project.complete": "完成项目",
  "admin.project.archive": "归档项目",
  "admin.project.cancel": "取消项目",
  "admin.project.restore": "恢复项目",
  "admin.ops.backup.data": "备份业务数据",
  "admin.ops.backup.system": "备份系统文件",
  "admin.ops.cleanup": "清理系统数据",
  "admin.ops.log.truncate": "清空运行日志",
}

// 审计 JSON 使用数据库字段名保存，详情弹窗通过这份映射转换成业务人员可读的中文标签。
const AUDIT_FIELD_LABELS: Readonly<Record<string, string>> = {
  status: "状态",
  preissueStatus: "预发状态",
  siStatus: "SI 状态",
  lifecycleStatus: "生命周期状态",
  currentStage: "当前阶段",
  projectStage: "项目阶段",
  releaseStatus: "质检状态",
  role: "角色",
  holderRole: "当前持有角色",
  username: "用户名",
  displayName: "显示名称",
  email: "邮箱",
  phone: "手机号",
  biography: "个人简介",
  avatarUrl: "头像地址",
  preferredLocale: "界面语言",
  projectId: "项目 ID",
  editorId: "编辑 ID",
  authorId: "作者 ID",
  siId: "SI ID",
  mainTypeId: "主类型 ID",
  mainTypeName: "主类型",
  fitAuthorIds: "适配作者 ID",
  fitAuthorNote: "适配作者说明",
  sourceSiId: "来源 SI ID",
  sourceSiTitle: "来源 SI 标题",
  createdOutlineDocId: "新建细纲文档 ID",
  docId: "文档 ID",
  draftId: "草稿 ID",
  activeDraftId: "活动草稿 ID",
  latestRevisionId: "最新版本 ID",
  finalRevisionId: "定稿版本 ID",
  releaseDocId: "质检文档 ID",
  revisionId: "版本 ID",
  sealedDraftId: "封存草稿 ID",
  restoredFromRevisionId: "恢复来源版本 ID",
  rollbackFromVersionId: "回滚来源版本 ID",
  rollbackFromVersionNo: "回滚来源版本号",
  title: "标题",
  name: "名称",
  code: "编码",
  mainType: "主类型",
  trope: "故事元素",
  freshTwist: "创新设定",
  coreSynopsis: "核心梗概",
  remarks: "备注",
  reason: "原因",
  submitNote: "提交说明",
  returnNote: "退回说明",
  approveNote: "审核说明",
  cancelNote: "取消说明",
  isActive: "是否启用",
  isDeleted: "是否删除",
  deleted: "是否已删除",
  updated: "是否已更新",
  reset: "是否已重置",
  sessionsRevoked: "是否已撤销旧会话",
  overwritten: "是否覆盖旧内容",
  lockVersion: "锁版本",
  wordCount: "字数",
  commentCount: "评论数",
  suggestionCount: "建议数",
  caller: "调用方",
  mode: "读取模式",
  requestedDocIds: "读取的 Doc ID",
  orderStart: "起始章序",
  orderEnd: "结束章序",
  page: "页码",
  pageSize: "每页数量",
  revisionMarkCount: "修订标记数",
  stageAdvanceResult: "阶段推进结果",
  nextProjectStage: "下一项目阶段",
  chapterNo: "章节号",
  chapterCount: "章节数",
  sortOrder: "排序",
  orderedDocIds: "排序后的文档 ID",
  items: "项目明细",
  stage: "阶段",
  planDays: "计划天数",
  warningDaysBeforeDue: "到期前预警天数",
  readNotificationDays: "已读通知保留天数",
  closedTodoDays: "已关闭待办保留天数",
  exportJobDays: "导出任务保留天数",
  expiredSessions: "过期会话数",
  oldReadNotifications: "旧已读通知数",
  oldClosedTodos: "旧已关闭待办数",
  oldExportJobs: "旧导出任务数",
  fileName: "文件名",
  sizeBytes: "文件大小（字节）",
  previousSizeBytes: "清理前文件大小（字节）",
}

// 同一个英文值在不同字段下可能含义不同，因此优先按字段进行精确翻译。
const AUDIT_FIELD_VALUE_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  status: {
    active: "正常",
    inactive: "已停用",
    disabled: "已禁用",
    pending: "待审批",
    rejected: "已拒绝",
    draft: "草稿",
    saved: "已保存",
    submitted: "待审核",
    approved: "已通过",
    preissued: "已预发",
    recalled: "已撤回",
    converted: "已转项目",
    archived: "已归档",
  },
  preissueStatus: {
    active: "预发中",
    withdrawn: "已撤回",
    preissued: "预发中",
    recalled: "已撤回",
    converted: "已转项目",
  },
  siStatus: {
    draft: "草稿",
    preissued: "已预发",
    converted: "已转项目",
    archived: "已归档",
  },
  lifecycleStatus: {
    active: "进行中",
    completed: "已完成",
    archived: "已归档",
    cancelled: "已取消",
  },
  releaseStatus: {
    locked: "未解锁",
    unlocked: "已解锁",
    approved: "已通过",
  },
  role: {
    admin: "管理员",
    editor: "编辑",
    author: "作者",
  },
  holderRole: {
    admin: "管理员",
    editor: "编辑",
    author: "作者",
    none: "无",
  },
  preferredLocale: {
    "zh-CN": "简体中文",
    "en-US": "英文",
  },
}

// 阶段编码会出现在 currentStage、projectStage 和 stage 等多个字段中，统一复用同一份翻译。
const AUDIT_STAGE_LABELS: Readonly<Record<string, string>> = {
  synopsis: "梗概",
  outline: "细纲",
  chapter: "正文",
  release: "质检",
  completed: "已完成",
}

function translateAuditString(value: string, fieldName?: string) {
  const fieldValue = fieldName ? AUDIT_FIELD_VALUE_LABELS[fieldName]?.[value] : undefined
  if (fieldValue) return fieldValue

  if (
    fieldName === "currentStage" ||
    fieldName === "projectStage" ||
    fieldName === "nextProjectStage" ||
    fieldName === "stage"
  ) {
    return AUDIT_STAGE_LABELS[value] ?? value
  }

  // 未知自由文本必须原样保留，避免姓名、原因或标题被错误翻译。
  return value || "空"
}

function formatAuditJsonValue(value: unknown, fieldName?: string): string {
  if (value === undefined || value === null) return "—"
  if (typeof value === "string") return translateAuditString(value, fieldName)
  if (typeof value === "number" || typeof value === "bigint") return String(value)
  if (typeof value === "boolean") return value ? "是" : "否"

  if (Array.isArray(value)) {
    // 数组逐项转为中文可读文本；最终长度由 change formatter 统一控制。
    return value.length === 0 ? "无" : value.map((item) => formatAuditJsonValue(item)).join("、")
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>)
    if (entries.length === 0) return "—"

    return entries
      .map(([key, nestedValue]) => {
        const label = AUDIT_FIELD_LABELS[key] ?? key
        return `${label}：${formatAuditJsonValue(nestedValue, key)}`
      })
      .join("；")
  }

  return String(value)
}

function truncateAuditText(value: string, maxLength: number) {
  if (value.length <= maxLength) return value
  if (maxLength <= 3) return ".".repeat(Math.max(0, maxLength))

  // 省略号也计入长度，确保返回文本严格不超过调用方指定的字符数。
  return `${value.slice(0, maxLength - 3)}...`
}

export function formatAuditAction(action: string) {
  // 未登记的新动作保留原始编码，既不会把审计信息误译，也方便后续发现并补齐映射。
  return AUDIT_ACTION_LABELS[action] ?? action
}

export function formatAuditChange(before: unknown, after: unknown, maxLength = 200) {
  // 变更前后合并后再截断，保证详情弹窗中的整个字段（包括箭头）不超过 200 个字符。
  const summary = `${formatAuditJsonValue(before)} → ${formatAuditJsonValue(after)}`
  return truncateAuditText(summary, maxLength)
}

export function formatAuditNote(metadata: unknown) {
  // 备注与变更摘要复用同一套递归中文解释器，但保留完整内容，不套用变更字段的 200 字限制。
  return formatAuditJsonValue(metadata)
}
