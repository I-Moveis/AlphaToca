-- CreateEnum
CREATE TYPE "ModerationStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');

-- AlterTable: properties recebe moderation_status com default temporário 'APPROVED'
-- para que todos os registros existentes fiquem aprovados (evita sumir imóveis do
-- search público). Em seguida trocamos o default para 'PENDING' — novas inserções
-- passarão a exigir aprovação explícita de um admin.
ALTER TABLE "properties"
  ADD COLUMN "moderation_status" "ModerationStatus" NOT NULL DEFAULT 'APPROVED',
  ADD COLUMN "moderation_reason" TEXT,
  ADD COLUMN "moderated_at" TIMESTAMP(3),
  ADD COLUMN "moderated_by" TEXT;

ALTER TABLE "properties"
  ALTER COLUMN "moderation_status" SET DEFAULT 'PENDING';

-- CreateIndex: busca de "pendentes de moderação" vai ser um padrão frequente no admin
CREATE INDEX "properties_moderation_status_idx" ON "properties" ("moderation_status");
