-- AlterTable
ALTER TABLE "chat_sessions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "city" TEXT,
ADD COLUMN     "state" VARCHAR(2),
ADD COLUMN     "zip_code" TEXT;
