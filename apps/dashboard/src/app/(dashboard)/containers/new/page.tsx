import { getWizardData } from "@/lib/containers/actions";
import { ContainerWizard } from "./container-wizard";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Create Container",
  description: "Configure and deploy a new LXC container",
};

export default async function NewContainerPage() {
  const {
    templates,
    storages,
    bridges,
    nextVmid,
    noNodeConfigured,
    osTemplates,
    clusterNodes,
  } = await getWizardData();

  return (
    <div className="flex flex-1 flex-col gap-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Create Container</h1>
        <p className="text-muted-foreground">
          Configure and deploy a new LXC container
        </p>
      </div>
      <ContainerWizard
        templates={templates}
        storages={storages}
        bridges={bridges}
        nextVmid={nextVmid}
        noNodeConfigured={noNodeConfigured}
        osTemplates={osTemplates}
        clusterNodes={clusterNodes}
      />
    </div>
  );
}
