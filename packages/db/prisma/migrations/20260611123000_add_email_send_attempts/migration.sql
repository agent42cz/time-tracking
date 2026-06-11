-- CreateTable
CREATE TABLE "email_send_attempts" (
    "id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "ip" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "email_send_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "email_send_attempts_email_created_at_idx" ON "email_send_attempts"("email", "created_at");

-- CreateIndex
CREATE INDEX "email_send_attempts_ip_created_at_idx" ON "email_send_attempts"("ip", "created_at");
