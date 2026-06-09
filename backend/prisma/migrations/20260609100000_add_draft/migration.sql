-- CreateTable
CREATE TABLE `Draft` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NOT NULL,
    `title` VARCHAR(191) NOT NULL,
    `fullText` TEXT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'recording',
    `audioMode` VARCHAR(191) NOT NULL DEFAULT 'mic',
    `recordingId` VARCHAR(191) NULL,
    `startedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `lastSavedAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updatedAt` DATETIME(3) NOT NULL,

    INDEX `Draft_userId_status_idx`(`userId`, `status`),
    INDEX `Draft_userId_lastSavedAt_idx`(`userId`, `lastSavedAt`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `Draft` ADD CONSTRAINT `Draft_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE CASCADE ON UPDATE CASCADE;
