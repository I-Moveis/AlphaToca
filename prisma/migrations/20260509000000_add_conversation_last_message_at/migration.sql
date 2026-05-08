-- US-006: Conversation.lastMessageAt is the authoritative timestamp of the latest message
-- in a thread. Populated by conversationService.createMessage in the same transaction as
-- the ConversationMessage insert. Kept nullable so conversations with zero messages stay
-- NULL (distinct from "has one ancient message"); the inbox `list` service falls back to
-- `createdAt` when this column is NULL so empty threads still sort alongside populated ones.

-- AlterTable
ALTER TABLE "conversations" ADD COLUMN     "last_message_at" TIMESTAMP(3);

-- Backfill: for every conversation that already has at least one message, set
-- last_message_at = MAX(conversation_messages.created_at). Conversations without
-- messages stay NULL so the list-service fallback path correctly identifies them
-- as "empty thread" rather than "idle since DB birth".
UPDATE "conversations" c
SET "last_message_at" = latest.max_created
FROM (
  SELECT "conversation_id", MAX("created_at") AS max_created
  FROM "conversation_messages"
  GROUP BY "conversation_id"
) AS latest
WHERE c."id" = latest."conversation_id";
