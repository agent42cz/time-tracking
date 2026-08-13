-- CreateEnum
CREATE TYPE "absence_kind" AS ENUM ('vacation', 'sick', 'doctor', 'personal', 'other');

-- CreateTable
CREATE TABLE "absences" (
    "id" TEXT NOT NULL,
    "company_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "kind" "absence_kind" NOT NULL,
    "start_date" DATE NOT NULL,
    "end_date" DATE NOT NULL,
    "note" TEXT NOT NULL DEFAULT '',
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "absences_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "absence_reads" (
    "id" TEXT NOT NULL,
    "absence_id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "seen_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "absence_reads_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "absences_company_id_start_date_idx" ON "absences"("company_id", "start_date");

-- CreateIndex
CREATE INDEX "absences_company_id_end_date_idx" ON "absences"("company_id", "end_date");

-- CreateIndex
CREATE INDEX "absences_user_id_start_date_idx" ON "absences"("user_id", "start_date");

-- CreateIndex
CREATE INDEX "absence_reads_user_id_idx" ON "absence_reads"("user_id");

-- CreateIndex
CREATE UNIQUE INDEX "absence_reads_absence_id_user_id_key" ON "absence_reads"("absence_id", "user_id");

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absences" ADD CONSTRAINT "absences_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_reads" ADD CONSTRAINT "absence_reads_absence_id_fkey" FOREIGN KEY ("absence_id") REFERENCES "absences"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "absence_reads" ADD CONSTRAINT "absence_reads_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
