-- AlterTable
ALTER TABLE "clients" ADD COLUMN     "fund_in_dashboard" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "week_starts_on" INTEGER,
ADD COLUMN     "weekly_fund_minutes" INTEGER,
ADD COLUMN     "working_days" INTEGER[] DEFAULT ARRAY[]::INTEGER[];

