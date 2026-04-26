-- CreateEnum
CREATE TYPE "PropertyType" AS ENUM ('APARTMENT', 'HOUSE', 'STUDIO', 'CONDO_HOUSE');

-- DropIndex
DROP INDEX "idx_knowledge_documents_embedding_hnsw";

-- AlterTable
ALTER TABLE "chat_sessions" ALTER COLUMN "expires_at" SET DEFAULT (now() + interval '7 days');

-- AlterTable
ALTER TABLE "properties" ADD COLUMN     "area" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "bathrooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "bedrooms" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "condo_fee" DECIMAL(10,2),
ADD COLUMN     "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "is_featured" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "is_furnished" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "near_subway" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "parking_spots" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "pets_allowed" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "property_tax" DECIMAL(10,2),
ADD COLUMN     "type" "PropertyType" NOT NULL DEFAULT 'APARTMENT',
ADD COLUMN     "views" INTEGER NOT NULL DEFAULT 0;
