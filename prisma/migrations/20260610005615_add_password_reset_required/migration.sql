-- AlterTable
ALTER TABLE `users` ADD COLUMN `password_reset_required` BOOLEAN NOT NULL DEFAULT false;
