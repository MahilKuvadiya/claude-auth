-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "Role" AS ENUM ('admin', 'pod_lead', 'member');

-- CreateTable
CREATE TABLE "Org" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "domain" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Org_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Pool" (
    "id" TEXT NOT NULL,
    "orgId" TEXT,
    "name" TEXT NOT NULL,
    "mode" TEXT NOT NULL DEFAULT 'failover',
    "status" TEXT NOT NULL DEFAULT 'active',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pool_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Member" (
    "poolId" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "email" TEXT,
    "accountUuid" TEXT,
    "poolRole" TEXT NOT NULL DEFAULT 'member',
    "status" TEXT NOT NULL DEFAULT 'active',
    "secretRef" TEXT,
    "accessToken" TEXT,
    "accessExpiresAt" TIMESTAMP(3),
    "subscriptionType" TEXT,
    "rateLimit" JSONB,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "revokedBy" TEXT,

    CONSTRAINT "Member_pkey" PRIMARY KEY ("poolId","memberId")
);

-- CreateTable
CREATE TABLE "JoinLink" (
    "token" TEXT NOT NULL,
    "poolId" TEXT NOT NULL,
    "targetEmail" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "createdBy" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3),
    "usedAt" TIMESTAMP(3),
    "memberId" TEXT,

    CONSTRAINT "JoinLink_pkey" PRIMARY KEY ("token")
);

-- CreateTable
CREATE TABLE "Rollup" (
    "poolId" TEXT NOT NULL,
    "period" TEXT NOT NULL,
    "tokensIn" BIGINT NOT NULL DEFAULT 0,
    "tokensOut" BIGINT NOT NULL DEFAULT 0,
    "cacheRead" BIGINT NOT NULL DEFAULT 0,
    "cacheWrite" BIGINT NOT NULL DEFAULT 0,
    "requests" BIGINT NOT NULL DEFAULT 0,
    "byMember" JSONB,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Rollup_pkey" PRIMARY KEY ("poolId","period")
);

-- CreateTable
CREATE TABLE "AnalyticsUser" (
    "email" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'member',
    "orgId" TEXT,
    "name" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AnalyticsUser_pkey" PRIMARY KEY ("email")
);

-- CreateTable
CREATE TABLE "Pod" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "orgId" TEXT,
    "leadEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Pod_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PodMembership" (
    "podId" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,

    CONSTRAINT "PodMembership_pkey" PRIMARY KEY ("podId","userEmail")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userEmail" TEXT NOT NULL,
    "project" TEXT,
    "gitBranch" TEXT,
    "model" TEXT,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "msgCount" INTEGER NOT NULL DEFAULT 0,
    "inputTokens" BIGINT NOT NULL DEFAULT 0,
    "outputTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheReadTokens" BIGINT NOT NULL DEFAULT 0,
    "cacheCreateTokens" BIGINT NOT NULL DEFAULT 0,
    "costUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Message" (
    "uuid" TEXT NOT NULL,
    "sessionId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "seq" INTEGER NOT NULL,
    "text" TEXT,
    "thinking" TEXT,
    "model" TEXT,
    "ts" TIMESTAMP(3),
    "durationMs" INTEGER,
    "inputTokens" INTEGER NOT NULL DEFAULT 0,
    "outputTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheReadTokens" INTEGER NOT NULL DEFAULT 0,
    "cacheCreateTokens" INTEGER NOT NULL DEFAULT 0,
    "toolNames" TEXT[],
    "isSidechain" BOOLEAN NOT NULL DEFAULT false,

    CONSTRAINT "Message_pkey" PRIMARY KEY ("uuid")
);

-- CreateTable
CREATE TABLE "SyncState" (
    "userEmail" TEXT NOT NULL,
    "filePath" TEXT NOT NULL,
    "byteOffset" BIGINT NOT NULL DEFAULT 0,
    "mtime" DOUBLE PRECISION,
    "lastSyncAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SyncState_pkey" PRIMARY KEY ("userEmail","filePath")
);

-- CreateIndex
CREATE INDEX "JoinLink_poolId_idx" ON "JoinLink"("poolId");

-- CreateIndex
CREATE INDEX "PodMembership_podId_idx" ON "PodMembership"("podId");

-- CreateIndex
CREATE INDEX "Session_userEmail_idx" ON "Session"("userEmail");

-- CreateIndex
CREATE INDEX "Session_project_idx" ON "Session"("project");

-- CreateIndex
CREATE INDEX "Session_startedAt_idx" ON "Session"("startedAt");

-- CreateIndex
CREATE INDEX "Message_sessionId_idx" ON "Message"("sessionId");

-- AddForeignKey
ALTER TABLE "Pool" ADD CONSTRAINT "Pool_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Member" ADD CONSTRAINT "Member_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JoinLink" ADD CONSTRAINT "JoinLink_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rollup" ADD CONSTRAINT "Rollup_poolId_fkey" FOREIGN KEY ("poolId") REFERENCES "Pool"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AnalyticsUser" ADD CONSTRAINT "AnalyticsUser_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pod" ADD CONSTRAINT "Pod_orgId_fkey" FOREIGN KEY ("orgId") REFERENCES "Org"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Pod" ADD CONSTRAINT "Pod_leadEmail_fkey" FOREIGN KEY ("leadEmail") REFERENCES "AnalyticsUser"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodMembership" ADD CONSTRAINT "PodMembership_podId_fkey" FOREIGN KEY ("podId") REFERENCES "Pod"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PodMembership" ADD CONSTRAINT "PodMembership_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "AnalyticsUser"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "AnalyticsUser"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Message" ADD CONSTRAINT "Message_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "Session"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SyncState" ADD CONSTRAINT "SyncState_userEmail_fkey" FOREIGN KEY ("userEmail") REFERENCES "AnalyticsUser"("email") ON DELETE RESTRICT ON UPDATE CASCADE;

