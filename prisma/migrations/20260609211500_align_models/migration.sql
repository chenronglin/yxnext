-- CreateTable
CREATE TABLE `users` (
    `user_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `username` VARCHAR(100) NOT NULL,
    `email` VARCHAR(255) NOT NULL,
    `password_hash` VARCHAR(255) NOT NULL,
    `role` ENUM('admin', 'editor', 'author') NOT NULL,
    `status` ENUM('active', 'disabled', 'pending', 'rejected') NOT NULL DEFAULT 'pending',
    `display_name` VARCHAR(100) NULL,
    `phone` VARCHAR(32) NULL,
    `biography` TEXT NULL,
    `avatar_url` VARCHAR(500) NULL,
    `approved_by` BIGINT UNSIGNED NULL,
    `approved_at` DATETIME(3) NULL,
    `rejected_reason` TEXT NULL,
    `last_login_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `users_username_key`(`username`),
    UNIQUE INDEX `users_email_key`(`email`),
    INDEX `idx_users_role_status`(`role`, `status`),
    PRIMARY KEY (`user_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_sessions` (
    `session_id` CHAR(64) NOT NULL,
    `user_id` BIGINT UNSIGNED NOT NULL,
    `expires_at` DATETIME(3) NOT NULL,
    `revoked_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_user_sessions_user`(`user_id`),
    INDEX `idx_user_sessions_expires`(`expires_at`),
    PRIMARY KEY (`session_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `editor_author_bindings` (
    `binding_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `editor_id` BIGINT UNSIGNED NOT NULL,
    `author_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('active', 'inactive') NOT NULL DEFAULT 'active',
    `bound_by` BIGINT UNSIGNED NOT NULL,
    `bound_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `unbound_by` BIGINT UNSIGNED NULL,
    `unbound_at` DATETIME(3) NULL,
    `note` TEXT NULL,
    `active_pair_key` VARCHAR(191) NULL,

    UNIQUE INDEX `editor_author_bindings_active_pair_key_key`(`active_pair_key`),
    INDEX `idx_editor_author_editor`(`editor_id`, `status`),
    INDEX `idx_editor_author_author`(`author_id`, `status`),
    PRIMARY KEY (`binding_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `si_main_types` (
    `main_type_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `code` VARCHAR(64) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `is_active` BOOLEAN NOT NULL DEFAULT true,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `si_main_types_code_key`(`code`),
    INDEX `idx_si_main_types_active_sort`(`is_active`, `sort_order`),
    PRIMARY KEY (`main_type_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `story_ideas` (
    `si_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `title` VARCHAR(255) NOT NULL,
    `main_type_id` BIGINT UNSIGNED NULL,
    `trope` VARCHAR(255) NULL,
    `fit_author_note` TEXT NULL,
    `remarks` TEXT NULL,
    `fresh_twist` TEXT NULL,
    `core_synopsis` MEDIUMTEXT NULL,
    `creator_editor_id` BIGINT UNSIGNED NOT NULL,
    `status` ENUM('draft', 'preissued', 'converted', 'archived') NOT NULL DEFAULT 'draft',
    `current_version_no` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `latest_version_id` BIGINT UNSIGNED NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `archived_at` DATETIME(3) NULL,

    INDEX `idx_story_ideas_editor_status`(`creator_editor_id`, `status`),
    INDEX `idx_story_ideas_type`(`main_type_id`),
    INDEX `idx_story_ideas_trope`(`trope`),
    PRIMARY KEY (`si_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `story_idea_versions` (
    `si_version_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `si_id` BIGINT UNSIGNED NOT NULL,
    `version_no` INTEGER UNSIGNED NOT NULL,
    `action` ENUM('create', 'update', 'rollback') NOT NULL DEFAULT 'update',
    `snapshot_json` JSON NOT NULL,
    `editor_id` BIGINT UNSIGNED NOT NULL,
    `rollback_from_version_id` BIGINT UNSIGNED NULL,
    `content_hash` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_si_versions_si_created`(`si_id`, `created_at`),
    INDEX `idx_si_versions_editor`(`editor_id`),
    UNIQUE INDEX `uk_si_versions_no`(`si_id`, `version_no`),
    PRIMARY KEY (`si_version_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `story_idea_fit_authors` (
    `si_id` BIGINT UNSIGNED NOT NULL,
    `author_id` BIGINT UNSIGNED NOT NULL,
    `note` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`si_id`, `author_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `si_preissues` (
    `preissue_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `si_id` BIGINT UNSIGNED NOT NULL,
    `si_version_id` BIGINT UNSIGNED NULL,
    `editor_id` BIGINT UNSIGNED NOT NULL,
    `author_id` BIGINT UNSIGNED NOT NULL,
    `preissue_note` TEXT NULL,
    `si_snapshot_json` JSON NOT NULL,
    `status` ENUM('preissued', 'converted', 'recalled') NOT NULL DEFAULT 'preissued',
    `project_id` BIGINT UNSIGNED NULL,
    `preissued_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `recalled_at` DATETIME(3) NULL,
    `converted_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `effective_pair_key` VARCHAR(191) NULL,

    UNIQUE INDEX `si_preissues_effective_pair_key_key`(`effective_pair_key`),
    INDEX `idx_si_preissues_author_status`(`author_id`, `status`),
    INDEX `idx_si_preissues_editor_status`(`editor_id`, `status`),
    INDEX `idx_si_preissues_si_status`(`si_id`, `status`),
    INDEX `idx_si_preissues_project`(`project_id`),
    PRIMARY KEY (`preissue_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `projects` (
    `project_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `source_si_id` BIGINT UNSIGNED NOT NULL,
    `si_preissue_id` BIGINT UNSIGNED NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `intro` TEXT NULL,
    `editor_id` BIGINT UNSIGNED NOT NULL,
    `author_id` BIGINT UNSIGNED NOT NULL,
    `lifecycle_status` ENUM('draft', 'active', 'completed', 'archived', 'cancelled') NOT NULL DEFAULT 'active',
    `current_stage` ENUM('synopsis', 'outline', 'chapter', 'release', 'completed') NOT NULL DEFAULT 'synopsis',
    `release_status` ENUM('locked', 'unlocked', 'approved') NOT NULL DEFAULT 'locked',
    `completed_at` DATETIME(3) NULL,
    `archived_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `restored_at` DATETIME(3) NULL,
    `created_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `projects_si_preissue_id_key`(`si_preissue_id`),
    INDEX `idx_projects_editor_status`(`editor_id`, `lifecycle_status`, `current_stage`),
    INDEX `idx_projects_author_status`(`author_id`, `lifecycle_status`, `current_stage`),
    INDEX `idx_projects_source_si`(`source_si_id`),
    PRIMARY KEY (`project_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stage_plan_defaults` (
    `stage_code` ENUM('synopsis', 'outline', 'chapter', 'release') NOT NULL,
    `default_plan_days` INTEGER UNSIGNED NOT NULL,
    `warning_days_before_due` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `updated_by` BIGINT UNSIGNED NULL,
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    PRIMARY KEY (`stage_code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_stage_plans` (
    `stage_plan_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `stage_code` ENUM('synopsis', 'outline', 'chapter', 'release') NOT NULL,
    `gate_status` ENUM('locked', 'unlocked', 'completed') NOT NULL DEFAULT 'locked',
    `timeline_status` ENUM('not_started', 'in_progress', 'due_soon', 'overdue', 'completed') NOT NULL DEFAULT 'not_started',
    `plan_days` INTEGER UNSIGNED NOT NULL,
    `unlocked_at` DATETIME(3) NULL,
    `started_at` DATETIME(3) NULL,
    `due_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_project_stage_plans_status`(`stage_code`, `gate_status`, `timeline_status`),
    INDEX `idx_project_stage_plans_due`(`due_at`, `timeline_status`),
    UNIQUE INDEX `uk_project_stage_plans_project_stage`(`project_id`, `stage_code`),
    PRIMARY KEY (`stage_plan_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `project_assignment_logs` (
    `assignment_log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `old_editor_id` BIGINT UNSIGNED NULL,
    `new_editor_id` BIGINT UNSIGNED NULL,
    `old_author_id` BIGINT UNSIGNED NULL,
    `new_author_id` BIGINT UNSIGNED NULL,
    `changed_by` BIGINT UNSIGNED NOT NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_project_assignment_logs_project`(`project_id`, `created_at`),
    PRIMARY KEY (`assignment_log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `docs` (
    `doc_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `doc_type` ENUM('synopsis', 'outline', 'chapter', 'release') NOT NULL,
    `stage_code` ENUM('synopsis', 'outline', 'chapter', 'release') NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `chapter_no` INTEGER UNSIGNED NULL,
    `sort_order` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` ENUM('draft', 'submitted', 'rejected', 'approved') NOT NULL DEFAULT 'draft',
    `holder_role` ENUM('author', 'editor', 'none') NOT NULL DEFAULT 'author',
    `active_draft_id` BIGINT UNSIGNED NULL,
    `latest_revision_id` BIGINT UNSIGNED NULL,
    `final_revision_id` BIGINT UNSIGNED NULL,
    `current_word_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `current_plain_text` MEDIUMTEXT NULL,
    `current_clean_text` MEDIUMTEXT NULL,
    `summary` TEXT NULL,
    `last_action` ENUM('author_save', 'author_submit', 'editor_save', 'editor_reject', 'editor_approve') NULL,
    `last_actor_id` BIGINT UNSIGNED NULL,
    `last_action_at` DATETIME(3) NULL,
    `last_handoff_note` TEXT NULL,
    `submitted_at` DATETIME(3) NULL,
    `reviewed_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `is_deleted` BOOLEAN NOT NULL DEFAULT false,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `single_doc_key` VARCHAR(191) NULL,
    `chapter_order_key` VARCHAR(191) NULL,

    UNIQUE INDEX `docs_single_doc_key_key`(`single_doc_key`),
    UNIQUE INDEX `docs_chapter_order_key_key`(`chapter_order_key`),
    INDEX `idx_docs_project_type_status`(`project_id`, `doc_type`, `status`),
    INDEX `idx_docs_project_stage`(`project_id`, `stage_code`),
    INDEX `idx_docs_holder_status`(`holder_role`, `status`),
    INDEX `idx_docs_last_action_at`(`last_action_at`),
    INDEX `idx_docs_last_actor`(`last_actor_id`),
    PRIMARY KEY (`doc_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doc_current_drafts` (
    `draft_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id` BIGINT UNSIGNED NOT NULL,
    `owner_role` ENUM('author', 'editor') NOT NULL,
    `owner_user_id` BIGINT UNSIGNED NOT NULL,
    `base_revision_id` BIGINT UNSIGNED NULL,
    `content_schema_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `content_json` JSON NOT NULL,
    `word_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `plain_text` MEDIUMTEXT NULL,
    `clean_text` MEDIUMTEXT NULL,
    `export_text` MEDIUMTEXT NULL,
    `summary` TEXT NULL,
    `comment_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `suggestion_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `revision_mark_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `status` ENUM('active', 'sealed', 'archived') NOT NULL DEFAULT 'active',
    `lock_version` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `save_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `sealed_at` DATETIME(3) NULL,
    `active_doc_key` BIGINT UNSIGNED NULL,

    UNIQUE INDEX `doc_current_drafts_active_doc_key_key`(`active_doc_key`),
    INDEX `idx_doc_current_drafts_doc_status`(`doc_id`, `status`),
    INDEX `idx_doc_current_drafts_owner`(`owner_user_id`, `owner_role`),
    INDEX `idx_doc_current_drafts_base_revision`(`base_revision_id`),
    PRIMARY KEY (`draft_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `doc_revisions` (
    `revision_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `doc_id` BIGINT UNSIGNED NOT NULL,
    `revision_no` INTEGER UNSIGNED NOT NULL,
    `base_revision_id` BIGINT UNSIGNED NULL,
    `from_draft_id` BIGINT UNSIGNED NOT NULL,
    `content_schema_version` INTEGER UNSIGNED NOT NULL DEFAULT 1,
    `content_json` JSON NOT NULL,
    `word_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `plain_text` MEDIUMTEXT NULL,
    `clean_text` MEDIUMTEXT NULL,
    `export_text` MEDIUMTEXT NULL,
    `summary` TEXT NULL,
    `comment_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `suggestion_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `revision_mark_count` INTEGER UNSIGNED NOT NULL DEFAULT 0,
    `action` ENUM('author_submit', 'editor_reject', 'editor_approve') NOT NULL,
    `actor_role` ENUM('author', 'editor', 'admin') NOT NULL,
    `actor_user_id` BIGINT UNSIGNED NOT NULL,
    `handoff_note` TEXT NULL,
    `content_hash` CHAR(64) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_doc_revisions_doc_created`(`doc_id`, `created_at`),
    INDEX `idx_doc_revisions_base`(`base_revision_id`),
    INDEX `idx_doc_revisions_actor`(`actor_user_id`, `actor_role`),
    INDEX `idx_doc_revisions_action_created`(`action`, `created_at`),
    UNIQUE INDEX `uk_doc_revisions_doc_no`(`doc_id`, `revision_no`),
    PRIMARY KEY (`revision_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `release_source_revisions` (
    `release_source_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `release_doc_id` BIGINT UNSIGNED NOT NULL,
    `source_chapter_doc_id` BIGINT UNSIGNED NOT NULL,
    `source_revision_id` BIGINT UNSIGNED NOT NULL,
    `source_order` INTEGER UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_release_source_project`(`project_id`),
    INDEX `idx_release_source_revision`(`source_revision_id`),
    UNIQUE INDEX `uk_release_source_doc`(`release_doc_id`, `source_chapter_doc_id`),
    PRIMARY KEY (`release_source_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `notification_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `type` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `body` TEXT NULL,
    `project_id` BIGINT UNSIGNED NULL,
    `doc_id` BIGINT UNSIGNED NULL,
    `si_id` BIGINT UNSIGNED NULL,
    `preissue_id` BIGINT UNSIGNED NULL,
    `entity_type` VARCHAR(64) NULL,
    `entity_id` BIGINT UNSIGNED NULL,
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_notifications_user_read_created`(`recipient_user_id`, `is_read`, `created_at`),
    INDEX `idx_notifications_project`(`project_id`),
    INDEX `idx_notifications_doc`(`doc_id`),
    INDEX `idx_notifications_si`(`si_id`),
    PRIMARY KEY (`notification_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `todo_items` (
    `todo_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `recipient_user_id` BIGINT UNSIGNED NOT NULL,
    `todo_type` VARCHAR(64) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `project_id` BIGINT UNSIGNED NULL,
    `doc_id` BIGINT UNSIGNED NULL,
    `si_id` BIGINT UNSIGNED NULL,
    `preissue_id` BIGINT UNSIGNED NULL,
    `entity_type` VARCHAR(64) NULL,
    `entity_id` BIGINT UNSIGNED NULL,
    `status` ENUM('open', 'done', 'cancelled') NOT NULL DEFAULT 'open',
    `is_read` BOOLEAN NOT NULL DEFAULT false,
    `read_at` DATETIME(3) NULL,
    `due_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,
    `cancelled_at` DATETIME(3) NULL,
    `dedupe_key` VARCHAR(191) NULL,
    `open_dedupe_key` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `todo_items_open_dedupe_key_key`(`open_dedupe_key`),
    INDEX `idx_todo_items_user_read_status_due`(`recipient_user_id`, `is_read`, `status`, `due_at`),
    INDEX `idx_todo_items_project`(`project_id`),
    INDEX `idx_todo_items_doc`(`doc_id`),
    PRIMARY KEY (`todo_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `operation_logs` (
    `log_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `actor_user_id` BIGINT UNSIGNED NULL,
    `actor_role` VARCHAR(32) NULL,
    `action` VARCHAR(128) NOT NULL,
    `entity_type` VARCHAR(64) NOT NULL,
    `entity_id` BIGINT UNSIGNED NOT NULL,
    `project_id` BIGINT UNSIGNED NULL,
    `doc_id` BIGINT UNSIGNED NULL,
    `si_id` BIGINT UNSIGNED NULL,
    `preissue_id` BIGINT UNSIGNED NULL,
    `request_id` VARCHAR(128) NULL,
    `ip_address` VARCHAR(64) NULL,
    `user_agent` VARCHAR(500) NULL,
    `before_json` JSON NULL,
    `after_json` JSON NULL,
    `metadata_json` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `idx_operation_logs_actor_created`(`actor_user_id`, `created_at`),
    INDEX `idx_operation_logs_entity`(`entity_type`, `entity_id`),
    INDEX `idx_operation_logs_project_created`(`project_id`, `created_at`),
    INDEX `idx_operation_logs_doc_created`(`doc_id`, `created_at`),
    INDEX `idx_operation_logs_action_created`(`action`, `created_at`),
    PRIMARY KEY (`log_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `export_jobs` (
    `export_job_id` BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
    `project_id` BIGINT UNSIGNED NOT NULL,
    `scope` ENUM('synopsis', 'outline', 'chapters', 'release', 'project') NOT NULL,
    `format` ENUM('docx', 'markdown') NOT NULL DEFAULT 'docx',
    `source_doc_id` BIGINT UNSIGNED NULL,
    `source_revision_id` BIGINT UNSIGNED NULL,
    `status` ENUM('pending', 'running', 'completed', 'failed') NOT NULL DEFAULT 'pending',
    `file_path` VARCHAR(1000) NULL,
    `error_message` TEXT NULL,
    `requested_by` BIGINT UNSIGNED NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `started_at` DATETIME(3) NULL,
    `completed_at` DATETIME(3) NULL,

    INDEX `idx_export_jobs_project_created`(`project_id`, `created_at`),
    INDEX `idx_export_jobs_requested_by`(`requested_by`, `created_at`),
    INDEX `idx_export_jobs_status`(`status`),
    PRIMARY KEY (`export_job_id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `users` ADD CONSTRAINT `users_approved_by_fkey` FOREIGN KEY (`approved_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `user_sessions` ADD CONSTRAINT `user_sessions_user_id_fkey` FOREIGN KEY (`user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `editor_author_bindings` ADD CONSTRAINT `editor_author_bindings_editor_id_fkey` FOREIGN KEY (`editor_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `editor_author_bindings` ADD CONSTRAINT `editor_author_bindings_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `editor_author_bindings` ADD CONSTRAINT `editor_author_bindings_bound_by_fkey` FOREIGN KEY (`bound_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `editor_author_bindings` ADD CONSTRAINT `editor_author_bindings_unbound_by_fkey` FOREIGN KEY (`unbound_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_ideas` ADD CONSTRAINT `story_ideas_main_type_id_fkey` FOREIGN KEY (`main_type_id`) REFERENCES `si_main_types`(`main_type_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_ideas` ADD CONSTRAINT `story_ideas_creator_editor_id_fkey` FOREIGN KEY (`creator_editor_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_ideas` ADD CONSTRAINT `story_ideas_latest_version_id_fkey` FOREIGN KEY (`latest_version_id`) REFERENCES `story_idea_versions`(`si_version_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_idea_versions` ADD CONSTRAINT `story_idea_versions_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_idea_versions` ADD CONSTRAINT `story_idea_versions_editor_id_fkey` FOREIGN KEY (`editor_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_idea_versions` ADD CONSTRAINT `story_idea_versions_rollback_from_version_id_fkey` FOREIGN KEY (`rollback_from_version_id`) REFERENCES `story_idea_versions`(`si_version_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_idea_fit_authors` ADD CONSTRAINT `story_idea_fit_authors_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `story_idea_fit_authors` ADD CONSTRAINT `story_idea_fit_authors_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `si_preissues` ADD CONSTRAINT `si_preissues_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `si_preissues` ADD CONSTRAINT `si_preissues_si_version_id_fkey` FOREIGN KEY (`si_version_id`) REFERENCES `story_idea_versions`(`si_version_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `si_preissues` ADD CONSTRAINT `si_preissues_editor_id_fkey` FOREIGN KEY (`editor_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `si_preissues` ADD CONSTRAINT `si_preissues_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `si_preissues` ADD CONSTRAINT `si_preissues_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_source_si_id_fkey` FOREIGN KEY (`source_si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_si_preissue_id_fkey` FOREIGN KEY (`si_preissue_id`) REFERENCES `si_preissues`(`preissue_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_editor_id_fkey` FOREIGN KEY (`editor_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_author_id_fkey` FOREIGN KEY (`author_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `projects` ADD CONSTRAINT `projects_created_by_fkey` FOREIGN KEY (`created_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `stage_plan_defaults` ADD CONSTRAINT `stage_plan_defaults_updated_by_fkey` FOREIGN KEY (`updated_by`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_stage_plans` ADD CONSTRAINT `project_stage_plans_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_old_editor_id_fkey` FOREIGN KEY (`old_editor_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_new_editor_id_fkey` FOREIGN KEY (`new_editor_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_old_author_id_fkey` FOREIGN KEY (`old_author_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_new_author_id_fkey` FOREIGN KEY (`new_author_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `project_assignment_logs` ADD CONSTRAINT `project_assignment_logs_changed_by_fkey` FOREIGN KEY (`changed_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `docs` ADD CONSTRAINT `docs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `docs` ADD CONSTRAINT `docs_last_actor_id_fkey` FOREIGN KEY (`last_actor_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `docs` ADD CONSTRAINT `docs_active_draft_id_fkey` FOREIGN KEY (`active_draft_id`) REFERENCES `doc_current_drafts`(`draft_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `docs` ADD CONSTRAINT `docs_latest_revision_id_fkey` FOREIGN KEY (`latest_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `docs` ADD CONSTRAINT `docs_final_revision_id_fkey` FOREIGN KEY (`final_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_current_drafts` ADD CONSTRAINT `doc_current_drafts_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_current_drafts` ADD CONSTRAINT `doc_current_drafts_owner_user_id_fkey` FOREIGN KEY (`owner_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_current_drafts` ADD CONSTRAINT `doc_current_drafts_base_revision_id_fkey` FOREIGN KEY (`base_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_revisions` ADD CONSTRAINT `doc_revisions_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_revisions` ADD CONSTRAINT `doc_revisions_base_revision_id_fkey` FOREIGN KEY (`base_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_revisions` ADD CONSTRAINT `doc_revisions_from_draft_id_fkey` FOREIGN KEY (`from_draft_id`) REFERENCES `doc_current_drafts`(`draft_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `doc_revisions` ADD CONSTRAINT `doc_revisions_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `release_source_revisions` ADD CONSTRAINT `release_source_revisions_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `release_source_revisions` ADD CONSTRAINT `release_source_revisions_release_doc_id_fkey` FOREIGN KEY (`release_doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `release_source_revisions` ADD CONSTRAINT `release_source_revisions_source_chapter_doc_id_fkey` FOREIGN KEY (`source_chapter_doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `release_source_revisions` ADD CONSTRAINT `release_source_revisions_source_revision_id_fkey` FOREIGN KEY (`source_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `notifications` ADD CONSTRAINT `notifications_preissue_id_fkey` FOREIGN KEY (`preissue_id`) REFERENCES `si_preissues`(`preissue_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_recipient_user_id_fkey` FOREIGN KEY (`recipient_user_id`) REFERENCES `users`(`user_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `todo_items` ADD CONSTRAINT `todo_items_preissue_id_fkey` FOREIGN KEY (`preissue_id`) REFERENCES `si_preissues`(`preissue_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_actor_user_id_fkey` FOREIGN KEY (`actor_user_id`) REFERENCES `users`(`user_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_doc_id_fkey` FOREIGN KEY (`doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_si_id_fkey` FOREIGN KEY (`si_id`) REFERENCES `story_ideas`(`si_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `operation_logs` ADD CONSTRAINT `operation_logs_preissue_id_fkey` FOREIGN KEY (`preissue_id`) REFERENCES `si_preissues`(`preissue_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_project_id_fkey` FOREIGN KEY (`project_id`) REFERENCES `projects`(`project_id`) ON DELETE CASCADE ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_source_doc_id_fkey` FOREIGN KEY (`source_doc_id`) REFERENCES `docs`(`doc_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_source_revision_id_fkey` FOREIGN KEY (`source_revision_id`) REFERENCES `doc_revisions`(`revision_id`) ON DELETE SET NULL ON UPDATE NO ACTION;

-- AddForeignKey
ALTER TABLE `export_jobs` ADD CONSTRAINT `export_jobs_requested_by_fkey` FOREIGN KEY (`requested_by`) REFERENCES `users`(`user_id`) ON DELETE NO ACTION ON UPDATE NO ACTION;

