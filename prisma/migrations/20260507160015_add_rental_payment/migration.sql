-- CreateEnum
CREATE TYPE "RentalPaymentStatus" AS ENUM ('AWAITING', 'PAID', 'LATE');

-- CreateTable
CREATE TABLE "rental_payments" (
    "id" TEXT NOT NULL,
    "property_id" TEXT NOT NULL,
    "period" VARCHAR(7) NOT NULL,
    "status" "RentalPaymentStatus" NOT NULL DEFAULT 'AWAITING',
    "updated_at" TIMESTAMP(3) NOT NULL,
    "updated_by" TEXT,

    CONSTRAINT "rental_payments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "rental_payments_property_id_period_key" ON "rental_payments"("property_id", "period");

-- CreateIndex
CREATE INDEX "rental_payments_property_idx" ON "rental_payments"("property_id");

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_property_id_fkey" FOREIGN KEY ("property_id") REFERENCES "properties"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "rental_payments" ADD CONSTRAINT "rental_payments_updated_by_fkey" FOREIGN KEY ("updated_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
