-- Switch knowledge_documents.embedding from vector(512) (OpenAI text-embedding-3-small
-- Matryoshka @ 512) to vector(1536) (Google gemini-embedding-001 @ 1536 dims).
--
-- Rationale: the team decided to adopt Gemini as the default RAG stack
-- (LLM + Embeddings) to leverage the free tier. gemini-embedding-001 does not
-- support 512 dims; recommended dims are 768/1536/3072. 1536 matches the
-- previous pre-512 shape, giving best retrieval quality without tripling
-- storage cost like 3072 would.
--
-- IMPORTANT: existing 512-dim vectors are NOT convertible across models. This
-- migration discards them (USING NULL). Run `npm run ingest:knowledge` after
-- applying to regenerate with the new provider.

-- 1. Drop the HNSW index (tied to the current column type).
DROP INDEX IF EXISTS "idx_knowledge_documents_embedding_hnsw";

-- 2. Resize the column and wipe existing vectors atomically.
ALTER TABLE "knowledge_documents"
  ALTER COLUMN "embedding" TYPE vector(1536) USING NULL;

-- 3. Recreate the HNSW index on the new shape. Non-concurrent is safe because
--    step 2 cleared every row; there is nothing to index yet.
CREATE INDEX "idx_knowledge_documents_embedding_hnsw"
  ON "knowledge_documents" USING hnsw ("embedding" vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
