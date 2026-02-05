-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PackageManager" AS ENUM ('apt', 'npm', 'pip', 'custom');

-- CreateEnum
CREATE TYPE "TemplateSource" AS ENUM ('filesystem', 'custom');

-- CreateEnum
CREATE TYPE "FilePolicy" AS ENUM ('replace', 'default', 'backup');

-- CreateEnum
CREATE TYPE "ContainerStatus" AS ENUM ('creating', 'running', 'stopped', 'error');

-- CreateEnum
CREATE TYPE "ServiceType" AS ENUM ('systemd', 'docker', 'process');

-- CreateEnum
CREATE TYPE "ServiceStatus" AS ENUM ('installing', 'running', 'stopped', 'error');

-- CreateEnum
CREATE TYPE "EventType" AS ENUM ('created', 'started', 'stopped', 'error', 'service_ready', 'script_completed');

-- CreateTable
CREATE TABLE "ProxmoxNode" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "port" INTEGER NOT NULL DEFAULT 8006,
    "tokenId" TEXT NOT NULL,
    "tokenSecret" TEXT NOT NULL,
    "fingerprint" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ProxmoxNode_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "source" "TemplateSource" NOT NULL DEFAULT 'filesystem',
    "path" TEXT,
    "osTemplate" TEXT,
    "cores" INTEGER,
    "memory" INTEGER,
    "swap" INTEGER,
    "diskSize" INTEGER,
    "storage" TEXT,
    "bridge" TEXT,
    "unprivileged" BOOLEAN NOT NULL DEFAULT true,
    "nesting" BOOLEAN NOT NULL DEFAULT false,
    "keyctl" BOOLEAN NOT NULL DEFAULT false,
    "fuse" BOOLEAN NOT NULL DEFAULT false,
    "tags" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PackageBucket" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PackageBucket_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Package" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "manager" "PackageManager" NOT NULL,
    "version" TEXT,
    "bucketId" TEXT,
    "templateId" TEXT,

    CONSTRAINT "Package_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateScript" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "content" TEXT NOT NULL,
    "description" TEXT,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "TemplateScript_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TemplateFile" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "targetPath" TEXT NOT NULL,
    "policy" "FilePolicy" NOT NULL DEFAULT 'replace',
    "content" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,

    CONSTRAINT "TemplateFile_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Container" (
    "id" TEXT NOT NULL,
    "vmid" INTEGER NOT NULL,
    "hostname" TEXT NOT NULL,
    "status" "ContainerStatus" NOT NULL DEFAULT 'creating',
    "ip" TEXT,
    "cores" INTEGER NOT NULL,
    "memory" INTEGER NOT NULL,
    "swap" INTEGER NOT NULL,
    "diskSize" INTEGER NOT NULL,
    "rootPassword" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "nodeId" TEXT NOT NULL,
    "templateId" TEXT,

    CONSTRAINT "Container_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerService" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "ServiceType" NOT NULL,
    "port" INTEGER,
    "webUrl" TEXT,
    "status" "ServiceStatus" NOT NULL DEFAULT 'installing',
    "credentials" TEXT,
    "containerId" TEXT NOT NULL,

    CONSTRAINT "ContainerService_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ContainerEvent" (
    "id" TEXT NOT NULL,
    "type" "EventType" NOT NULL,
    "message" TEXT NOT NULL,
    "metadata" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "containerId" TEXT NOT NULL,

    CONSTRAINT "ContainerEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ProxmoxNode_name_key" ON "ProxmoxNode"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Template_name_key" ON "Template"("name");

-- CreateIndex
CREATE UNIQUE INDEX "PackageBucket_name_key" ON "PackageBucket"("name");

-- CreateIndex
CREATE INDEX "Package_bucketId_idx" ON "Package"("bucketId");

-- CreateIndex
CREATE INDEX "Package_templateId_idx" ON "Package"("templateId");

-- CreateIndex
CREATE INDEX "TemplateScript_templateId_idx" ON "TemplateScript"("templateId");

-- CreateIndex
CREATE INDEX "TemplateFile_templateId_idx" ON "TemplateFile"("templateId");

-- CreateIndex
CREATE UNIQUE INDEX "Container_vmid_key" ON "Container"("vmid");

-- CreateIndex
CREATE INDEX "Container_vmid_idx" ON "Container"("vmid");

-- CreateIndex
CREATE INDEX "Container_status_idx" ON "Container"("status");

-- CreateIndex
CREATE INDEX "Container_nodeId_idx" ON "Container"("nodeId");

-- CreateIndex
CREATE INDEX "Container_templateId_idx" ON "Container"("templateId");

-- CreateIndex
CREATE INDEX "ContainerService_containerId_idx" ON "ContainerService"("containerId");

-- CreateIndex
CREATE INDEX "ContainerEvent_containerId_createdAt_idx" ON "ContainerEvent"("containerId", "createdAt");

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_bucketId_fkey" FOREIGN KEY ("bucketId") REFERENCES "PackageBucket"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Package" ADD CONSTRAINT "Package_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateScript" ADD CONSTRAINT "TemplateScript_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TemplateFile" ADD CONSTRAINT "TemplateFile_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_nodeId_fkey" FOREIGN KEY ("nodeId") REFERENCES "ProxmoxNode"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Container" ADD CONSTRAINT "Container_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerService" ADD CONSTRAINT "ContainerService_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ContainerEvent" ADD CONSTRAINT "ContainerEvent_containerId_fkey" FOREIGN KEY ("containerId") REFERENCES "Container"("id") ON DELETE CASCADE ON UPDATE CASCADE;

