-- AlterTable
ALTER TABLE "Availability" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE INDEX "Availability_createdAt_idx" ON "Availability"("createdAt");
