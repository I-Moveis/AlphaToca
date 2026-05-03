-- CreateEnum
CREATE TYPE "NotificationType" AS ENUM ('VISIT_SCHEDULED', 'VISIT_CANCELLED', 'VISIT_REMINDER', 'VISIT_COMPLETED', 'RENTAL_STAGE_CHANGED', 'RENTAL_CLOSED', 'DOCUMENT_REQUESTED', 'DOCUMENT_REJECTED', 'PROPERTY_APPROVED', 'PROPERTY_REJECTED', 'BROADCAST');

-- AlterTable
ALTER TABLE "chat_sessions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "user_id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "data" JSONB,
    "read_at" TIMESTAMP(3),
    "sent_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "notifications_user_read_idx" ON "notifications"("user_id", "read_at");

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
