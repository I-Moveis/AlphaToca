-- CreateTable
CREATE TABLE "webhook_failures" (
    "id" TEXT NOT NULL,
    "source" TEXT NOT NULL,
    "raw_body" JSONB NOT NULL,
    "headers" JSONB,
    "error" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewed" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "webhook_failures_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "webhook_failures_triage_idx" ON "webhook_failures"("source", "reviewed", "created_at");
