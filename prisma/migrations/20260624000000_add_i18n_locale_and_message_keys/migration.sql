ALTER TABLE `users`
  ADD COLUMN `preferred_locale` VARCHAR(16) NOT NULL DEFAULT 'zh-CN' AFTER `avatar_url`;

ALTER TABLE `notifications`
  ADD COLUMN `message_key` VARCHAR(128) NULL AFTER `type`,
  ADD COLUMN `message_params` JSON NULL AFTER `message_key`;

ALTER TABLE `todo_items`
  ADD COLUMN `message_key` VARCHAR(128) NULL AFTER `todo_type`,
  ADD COLUMN `message_params` JSON NULL AFTER `message_key`;
