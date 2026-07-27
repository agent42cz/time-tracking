/*
  Warnings:

  - You are about to drop the `tags` table. If the table is not empty, all the data it contains will be lost.
  - You are about to drop the `time_entry_tags` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "tags" DROP CONSTRAINT "tags_company_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entry_tags" DROP CONSTRAINT "time_entry_tags_tag_id_fkey";

-- DropForeignKey
ALTER TABLE "time_entry_tags" DROP CONSTRAINT "time_entry_tags_time_entry_id_fkey";

-- DropTable
DROP TABLE "time_entry_tags";

-- DropTable
DROP TABLE "tags";
