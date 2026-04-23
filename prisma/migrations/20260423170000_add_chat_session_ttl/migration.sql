-- Adds a 7-day TTL to chat_sessions. Existing rows get backfilled to
-- started_at + 7 days so they respect the same lifecycle retroactively.
ALTER TABLE "chat_sessions"
  ADD COLUMN "expires_at" TIMESTAMP(3) NOT NULL DEFAULT (now() + interval '7 days');

-- Backfill existing rows: align TTL to their actual start date, not the migration time.
UPDATE "chat_sessions"
  SET "expires_at" = "started_at" + interval '7 days'
  WHERE "expires_at" IS NOT NULL;

-- Supports fast lookup of active-but-not-expired sessions and future reaper jobs.
CREATE INDEX "chat_sessions_expires_at_idx" ON "chat_sessions"("expires_at");
