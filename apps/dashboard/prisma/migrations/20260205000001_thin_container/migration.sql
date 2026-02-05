-- Drop columns that duplicate Proxmox API data
ALTER TABLE "Container" DROP COLUMN "hostname";
ALTER TABLE "Container" DROP COLUMN "ip";
ALTER TABLE "Container" DROP COLUMN "cores";
ALTER TABLE "Container" DROP COLUMN "memory";
ALTER TABLE "Container" DROP COLUMN "swap";
ALTER TABLE "Container" DROP COLUMN "diskSize";

-- Create new enum for app lifecycle (not runtime state)
CREATE TYPE "ContainerLifecycle" AS ENUM ('creating', 'ready', 'error');

-- Migrate the status column to lifecycle with new enum
-- Map old runtime states (running/stopped) to new app state (ready)
ALTER TABLE "Container"
  ALTER COLUMN "status" DROP DEFAULT,
  ALTER COLUMN "status" TYPE "ContainerLifecycle" USING (
    CASE "status"::text
      WHEN 'creating' THEN 'creating'::"ContainerLifecycle"
      WHEN 'running' THEN 'ready'::"ContainerLifecycle"
      WHEN 'stopped' THEN 'ready'::"ContainerLifecycle"
      WHEN 'error' THEN 'error'::"ContainerLifecycle"
    END
  ),
  ALTER COLUMN "status" SET DEFAULT 'creating'::"ContainerLifecycle";

-- Rename column to reflect its purpose
ALTER TABLE "Container" RENAME COLUMN "status" TO "lifecycle";

-- Drop old enum
DROP TYPE "ContainerStatus";

-- Update index
DROP INDEX "Container_status_idx";
CREATE INDEX "Container_lifecycle_idx" ON "Container"("lifecycle");
