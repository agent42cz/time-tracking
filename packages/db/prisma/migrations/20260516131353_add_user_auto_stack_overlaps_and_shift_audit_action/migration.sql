-- AlterEnum
ALTER TYPE "AuditAction" ADD VALUE 'shift';

-- AlterTable
ALTER TABLE "users" ADD COLUMN     "auto_stack_overlaps" BOOLEAN NOT NULL DEFAULT false;
