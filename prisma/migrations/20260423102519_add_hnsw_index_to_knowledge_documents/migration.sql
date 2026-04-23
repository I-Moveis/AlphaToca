-- CreateIndex
-- HNSW index for approximate nearest neighbor search on the embedding column.
-- Without this index, every similarity query performs a sequential scan O(n).
-- Parameters: m=16 (max bi-directional connections per layer), ef_construction=64 (search depth during build).
-- For production datasets > 10k rows, consider increasing ef_construction to 128-200.
CREATE INDEX CONCURRENTLY idx_knowledge_documents_embedding_hnsw
  ON knowledge_documents USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 64);
