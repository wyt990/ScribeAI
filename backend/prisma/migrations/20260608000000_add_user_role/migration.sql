-- Add role field to User model
ALTER TABLE `User` ADD `role` VARCHAR(20) NOT NULL DEFAULT 'user';
