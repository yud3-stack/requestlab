CREATE TYPE "ReplayStatus" AS ENUM ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED', 'UNCERTAIN');

CREATE TABLE "ReplayRun" (
    "id" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "originalEventId" TEXT NOT NULL,
    "environmentId" TEXT NOT NULL,
    "requestedBy" TEXT NOT NULL,
    "status" "ReplayStatus" NOT NULL DEFAULT 'QUEUED',
    "method" TEXT NOT NULL,
    "targetUrl" TEXT NOT NULL,
    "requestHeaders" JSONB,
    "requestQuery" JSONB,
    "requestBody" JSONB,
    "responseHeaders" JSONB,
    "responseBody" JSONB,
    "statusCode" INTEGER,
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "finishedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "ReplayRun_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ReplayRun_projectId_status_createdAt_idx" ON "ReplayRun"("projectId", "status", "createdAt");
CREATE INDEX "ReplayRun_projectId_environmentId_createdAt_idx" ON "ReplayRun"("projectId", "environmentId", "createdAt");
CREATE INDEX "ReplayRun_originalEventId_idx" ON "ReplayRun"("originalEventId");
ALTER TABLE "ReplayRun" ADD CONSTRAINT "ReplayRun_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplayRun" ADD CONSTRAINT "ReplayRun_originalEventId_fkey" FOREIGN KEY ("originalEventId") REFERENCES "RequestEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplayRun" ADD CONSTRAINT "ReplayRun_environmentId_fkey" FOREIGN KEY ("environmentId") REFERENCES "Environment"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ReplayRun" ADD CONSTRAINT "ReplayRun_requestedBy_fkey" FOREIGN KEY ("requestedBy") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
