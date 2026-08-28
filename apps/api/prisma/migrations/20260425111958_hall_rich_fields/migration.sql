-- AlterTable
ALTER TABLE "Hall" ADD COLUMN     "advancePercent" INTEGER NOT NULL DEFAULT 50,
ADD COLUMN     "amenities" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "cancellationPolicy" TEXT,
ADD COLUMN     "diningCapacity" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN     "houseRules" TEXT,
ADD COLUMN     "imageUrls" TEXT[] DEFAULT ARRAY[]::TEXT[],
ADD COLUMN     "latitude" DOUBLE PRECISION,
ADD COLUMN     "longitude" DOUBLE PRECISION,
ADD COLUMN     "perEventPrice" INTEGER;
