-- US-013: extend Notification model for cross-device history.
--
-- Adds `NotificationCategory` enum + `category` column (default 'announcement')
-- so the /notifications screen can bucket pushes into update/announcement/system
-- groups that the existing `NotificationType` (FCM-dispatch taxonomy) doesn't
-- express.
--
-- Renames `sent_at` to `received_at` in-place via ALTER TABLE RENAME COLUMN.
-- This is a data-preserving rename (not a DROP + ADD) — existing rows keep
-- their original timestamps. Prisma's `migrate diff` emits DROP + ADD when it
-- sees a schema field rename because it can't tell the two are related; the
-- hand-authored version below uses RENAME so no history is lost on prod.
--
-- Adds the `(user_id, received_at)` index called out in the US-013 AC. The
-- existing `(user_id, read_at)` index is kept because `/notifications/unread-count`
-- still filters `WHERE user_id = X AND read_at IS NULL`.

-- CreateEnum
CREATE TYPE "NotificationCategory" AS ENUM ('update', 'announcement', 'system');

-- AlterTable: add category column with default 'announcement'. Existing rows
-- (dispatched by pushNotificationService before US-013) are backfilled to
-- 'announcement' via the NOT NULL DEFAULT clause, which matches the original
-- BROADCAST semantic — the "cross-device history" screen bucketed old pushes
-- under the announcements tab before any category existed.
ALTER TABLE "notifications" ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'announcement';

-- RenameColumn: sent_at -> received_at. Data-preserving.
ALTER TABLE "notifications" RENAME COLUMN "sent_at" TO "received_at";

-- CreateIndex
CREATE INDEX "notifications_user_received_at_idx" ON "notifications"("user_id", "received_at");
