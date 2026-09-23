-- 从上一已提交版本一次性升级：同时支持作者撤回和编辑显式开始审核，不依赖中间开发版本。
-- 审核开始标记属于本轮编辑草稿；作者重新提交时新草稿默认为未开始审核。
ALTER TABLE `doc_current_drafts` ADD COLUMN `review_started_at` DATETIME(3) NULL;
ALTER TABLE `docs` MODIFY `last_action` ENUM('author_save', 'author_submit', 'editor_save', 'editor_reject', 'editor_approve', 'author_withdraw', 'editor_start_review') NULL;
ALTER TABLE `doc_revisions` MODIFY `action` ENUM('author_submit', 'editor_reject', 'editor_approve', 'author_withdraw') NOT NULL;

-- 保护升级前已有的审稿成果：历史编辑保存等同已开始审核，不能重新放开作者撤回。
-- 这里的时间是兼容标记，不声称历史用户曾点击过新版按钮。
UPDATE `doc_current_drafts` AS draft
SET draft.`review_started_at` = draft.`updated_at`
WHERE draft.`owner_role` = 'editor' AND draft.`save_count` > 0;
