-- Reduce knowledge_documents.embedding from vector(1536) to vector(512).
-- Matryoshka truncation (text-embedding-3-small with `dimensions: 512`) retains
-- ~98% of retrieval quality at 1/3 of the storage cost and ~3x faster cosine
-- distance computation.
--
-- NOTE: existing 1536-dim vectors are NOT convertible to 512 dims at the DB
-- level — they must be re-embedded by the ingestion script. This migration
-- clears all embeddings and requires running `npm run ingest:knowledge`
-- afterwards to repopulate the column.

-- 1. Drop the HNSW index (it references the current column type).
DROP INDEX IF EXISTS "idx_knowledge_documents_embedding_hnsw";

-- 2. Clear existing vectors and change the column type in one statement.
--    The USING NULL cast discards old data; queries already filter on
--    `embedding IS NOT NULL`, so the retriever returns zero results until
--    ingestion runs again.
ALTER TABLE "knowledge_documents"
  ALTER COLUMN "embedding" TYPE vector(512) USING NULL;

-- 3. Recreate the HNSW index against the new column shape.
-- NOTE: non-concurrent CREATE INDEX is safe here because step 2 just wiped
-- every embedding to NULL, so there are zero tuples to index. Prisma also
-- wraps multi-statement migrations in a transaction, and CONCURRENTLY is
-- not allowed inside a transaction block.
CREATE INDEX "idx_knowledge_documents_embedding_hnsw"
  ON "knowledge_documents" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
