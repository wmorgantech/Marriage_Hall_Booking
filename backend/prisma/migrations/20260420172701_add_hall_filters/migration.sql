-- DropIndex
DROP INDEX "Hall_city_isApproved_idx";

-- AlterTable
ALTER TABLE "Hall" ADD COLUMN     "area" TEXT NOT NULL DEFAULT '',
ADD COLUMN     "capacity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "hasAC" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "hasRooms" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "imageUrl" TEXT;

-- CreateIndex
CREATE INDEX "Hall_city_area_isApproved_idx" ON "Hall"("city", "area", "isApproved");
