-- CreateTable
CREATE TABLE "Settings" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "customerCarePhone" TEXT NOT NULL DEFAULT '',
    "customerCareEmail" TEXT NOT NULL DEFAULT '',
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Settings_pkey" PRIMARY KEY ("id")
);
