-- CreateTable
CREATE TABLE "conversations" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "landlord_id" TEXT NOT NULL,
    "tenant_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "conversations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "conversations_landlord_idx" ON "conversations"("landlord_id");

-- CreateIndex
CREATE INDEX "conversations_tenant_idx" ON "conversations"("tenant_id");

-- CreateIndex
CREATE UNIQUE INDEX "conversations_property_id_landlord_id_tenant_id_key" ON "conversations"("property_id", "landlord_id", "tenant_id");

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_landlord_id_fkey" FOREIGN KEY ("landlord_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "conversations" ADD CONSTRAINT "conversations_tenant_id_fkey" FOREIGN KEY ("tenant_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
