-- CreateEnum
CREATE TYPE "Role" AS ENUM ('USER', 'OWNER', 'ADMIN');

-- CreateEnum
CREATE TYPE "AvailabilityStatus" AS ENUM ('AVAILABLE', 'BOOKED');

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "email" TEXT,
    "passwordHash" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'OWNER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Hall" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "address" TEXT NOT NULL,
    "price" INTEGER NOT NULL,
    "contactNumber" TEXT NOT NULL,
    "description" TEXT,
    "isApproved" BOOLEAN NOT NULL DEFAULT false,
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Hall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Availability" (
    "id" TEXT NOT NULL,
    "hallId" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "status" "AvailabilityStatus" NOT NULL DEFAULT 'AVAILABLE',

    CONSTRAINT "Availability_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_phone_key" ON "User"("phone");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "Hall_city_isApproved_idx" ON "Hall"("city", "isApproved");

-- CreateIndex
CREATE INDEX "Availability_date_idx" ON "Availability"("date");

-- CreateIndex
CREATE UNIQUE INDEX "Availability_hallId_date_key" ON "Availability"("hallId", "date");

-- AddForeignKey
ALTER TABLE "Hall" ADD CONSTRAINT "Hall_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Availability" ADD CONSTRAINT "Availability_hallId_fkey" FOREIGN KEY ("hallId") REFERENCES "Hall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
