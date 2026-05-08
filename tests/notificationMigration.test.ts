import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';

const MIGRATION_PATH = path.resolve(
  __dirname,
  '../prisma/migrations/20260510000000_extend_notification_for_history/migration.sql',
);

describe('US-013 migration — extend Notification for history', () => {
  const sql = fs.readFileSync(MIGRATION_PATH, 'utf8');

  it('creates the NotificationCategory enum with the 3 values', () => {
    expect(sql).toMatch(
      /CREATE TYPE "NotificationCategory" AS ENUM \('update', 'announcement', 'system'\);/,
    );
  });

  it('adds the category column with default announcement', () => {
    expect(sql).toMatch(
      /ALTER TABLE "notifications" ADD COLUMN "category" "NotificationCategory" NOT NULL DEFAULT 'announcement';/,
    );
  });

  it('renames sent_at -> received_at (data-preserving, not DROP/ADD)', () => {
    expect(sql).toMatch(
      /ALTER TABLE "notifications" RENAME COLUMN "sent_at" TO "received_at";/,
    );
    // Explicitly guard against a regression to DROP + ADD (which would lose history).
    expect(sql).not.toMatch(/DROP COLUMN "sent_at"/);
  });

  it('creates the (user_id, received_at) index called out by the AC', () => {
    expect(sql).toMatch(
      /CREATE INDEX "notifications_user_received_at_idx" ON "notifications"\("user_id", "received_at"\);/,
    );
  });
});
