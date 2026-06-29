-- Trope 是编辑在 SI 表单里直接输入的多标签组合，前端会用 " / " 拼接多个标签。
-- 原来的 VARCHAR(255) 容量过小，标签稍多时会触发数据库字段过长并被接口兜底成 500。
DROP INDEX `idx_story_ideas_trope` ON `story_ideas`;

-- 改为 TEXT 后可以承载更完整的标签组合，避免正常保存/保存并预发流程因为标签长度失败。
ALTER TABLE `story_ideas`
  MODIFY COLUMN `trope` TEXT NULL;

-- MySQL/MariaDB 对 TEXT 建索引必须指定前缀长度；这里保留 191 字符前缀索引，用于现有 Trope 搜索过滤。
CREATE INDEX `idx_story_ideas_trope` ON `story_ideas`(`trope`(191));
