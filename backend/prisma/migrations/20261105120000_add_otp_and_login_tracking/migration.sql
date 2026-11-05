-- CreateTable
CREATE TABLE "OtpEntry" (
    "phone" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "sentAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OtpEntry_pkey" PRIMARY KEY ("phone")
);

-- CreateIndex
CREATE INDEX "OtpEntry_expiresAt_idx" ON "OtpEntry"("expiresAt");

-- CreateTable
CREATE TABLE "LoginAttempt" (
    "id" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "success" BOOLEAN NOT NULL DEFAULT false,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LoginAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "LoginAttempt_target_createdAt_idx" ON "LoginAttempt"("target", "createdAt");

-- CreateIndex
CREATE INDEX "LoginAttempt_createdAt_idx" ON "LoginAttempt"("createdAt");

-- Index for Hall text search (name, price, capacity)
CREATE INDEX "Hall_name_idx" ON "Hall"("name");
CREATE INDEX "Hall_capacity_idx" ON "Hall"("capacity");
CREATE INDEX "Hall_price_idx" ON "Hall"("price");
