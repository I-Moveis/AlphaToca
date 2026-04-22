-- AlterTable
ALTER TABLE "knowledge_documents" ADD COLUMN     "chunk_index" INTEGER NOT NULL,
ADD COLUMN     "content_hash" TEXT NOT NULL,
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "source_path" TEXT NOT NULL,
ADD COLUMN     "updated_at" TIMESTAMP(3) NOT NULL;

-- CreateIndex
CREATE INDEX "knowledge_documents_content_hash_idx" ON "knowledge_documents"("content_hash");

-- CreateIndex
CREATE UNIQUE INDEX "knowledge_documents_source_path_chunk_index_key" ON "knowledge_documents"("source_path", "chunk_index");
