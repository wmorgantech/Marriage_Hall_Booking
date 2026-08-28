-- CreateTable
CREATE TABLE "Area" (
    "id" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Area_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Area_city_idx" ON "Area"("city");

-- CreateIndex
CREATE UNIQUE INDEX "Area_city_name_key" ON "Area"("city", "name");
