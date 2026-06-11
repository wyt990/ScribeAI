-- CreateTable
CREATE TABLE `OperationTrace` (
    `id` VARCHAR(191) NOT NULL,
    `userId` VARCHAR(191) NULL,
    `category` VARCHAR(191) NOT NULL,
    `action` VARCHAR(191) NOT NULL,
    `status` VARCHAR(191) NOT NULL DEFAULT 'ok',
    `durationMs` INTEGER NULL,
    `target` VARCHAR(191) NULL,
    `detail` JSON NULL,
    `createdAt` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    INDEX `OperationTrace_category_idx`(`category`),
    INDEX `OperationTrace_status_idx`(`status`),
    INDEX `OperationTrace_createdAt_idx`(`createdAt`),
    INDEX `OperationTrace_userId_idx`(`userId`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `OperationTrace` ADD CONSTRAINT `OperationTrace_userId_fkey` FOREIGN KEY (`userId`) REFERENCES `User`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
