"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";

import { Alert, AlertDescription } from "@/components/ui/alert";

import { WizardStepper } from "./wizard-stepper";
import { TemplateStep } from "./steps/template-step";
import { ConfigureStep } from "./steps/configure-step";
import { PackagesStep } from "./steps/packages-step";
import { ScriptsStep } from "./steps/scripts-step";
import { ReviewStep } from "./steps/review-step";

import { createContainerAction } from "@/lib/containers/actions";
import type {
  WizardTemplate,
  WizardStorage,
  WizardBridge,
} from "@/lib/containers/actions";
import type {
  TemplateSelection,
  ContainerConfig,
  PackageSelection,
  ScriptConfig,
} from "@/lib/containers/schemas";

interface ContainerWizardProps {
  templates: WizardTemplate[];
  storages: WizardStorage[];
  bridges: WizardBridge[];
  nextVmid: number;
  noNodeConfigured: boolean;
}

export function ContainerWizard({
  templates,
  storages,
  bridges,
  nextVmid,
  noNodeConfigured,
}: ContainerWizardProps) {
  const [step, setStep] = useState(1);
  const [templateData, setTemplateData] = useState<TemplateSelection | null>(
    null,
  );
  const [configData, setConfigData] = useState<ContainerConfig | null>(null);
  const [packagesData, setPackagesData] = useState<PackageSelection | null>(
    null,
  );
  const [scriptsData, setScriptsData] = useState<ScriptConfig | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  // Find selected template for defaults propagation
  const selectedTemplate = templateData?.templateId
    ? (templates.find((t) => t.id === templateData.templateId) ?? null)
    : null;

  // Track completed steps for stepper
  const completedSteps: number[] = [];
  if (templateData) completedSteps.push(1);
  if (configData) completedSteps.push(2);
  if (packagesData) completedSteps.push(3);
  if (scriptsData) completedSteps.push(4);

  // Step handlers
  function handleTemplateNext(data: TemplateSelection) {
    setTemplateData(data);
    // When template changes, reset downstream data so it re-initializes from template
    if (data.templateId !== templateData?.templateId) {
      setConfigData(null);
      setPackagesData(null);
      setScriptsData(null);
    }
    setStep(2);
  }

  function handleConfigNext(data: ContainerConfig) {
    setConfigData(data);
    setStep(3);
  }

  function handlePackagesNext(data: PackageSelection) {
    setPackagesData(data);
    setStep(4);
  }

  function handleScriptsNext(data: ScriptConfig) {
    setScriptsData(data);
    setStep(5);
  }

  function handleBack() {
    setStep((prev) => Math.max(1, prev - 1));
  }

  async function handleDeploy() {
    if (!configData) return;

    startTransition(async () => {
      const result = await createContainerAction({
        templateId: templateData?.templateId ?? null,
        hostname: configData.hostname,
        vmid: configData.vmid,
        rootPassword: configData.rootPassword,
        cores: configData.cores,
        memory: configData.memory,
        swap: configData.swap,
        diskSize: configData.diskSize,
        storage: configData.storage,
        bridge: configData.bridge,
        ipConfig: configData.ipConfig,
        nameserver: configData.nameserver,
        unprivileged: configData.unprivileged,
        nesting: configData.nesting,
        sshPublicKey: configData.sshPublicKey,
        tags: configData.tags,
        ostemplate: configData.ostemplate,
        enabledBuckets: packagesData?.enabledBuckets,
        additionalPackages: packagesData?.additionalPackages,
        scripts: scriptsData?.scripts.map((s) => ({
          id: s.id,
          name: s.name,
          enabled: s.enabled,
          order: s.order,
        })),
      });

      if (result?.data?.containerId) {
        toast.success("Container creation started!");
        router.push(`/containers/${result.data.containerId}/progress`);
      } else {
        const errorMessage =
          result?.serverError ??
          "Failed to create container. Please try again.";
        toast.error(errorMessage);
      }
    });
  }

  return (
    <div className="space-y-8">
      {noNodeConfigured && (
        <Alert variant="destructive">
          <AlertDescription>
            No Proxmox node is configured. Please add a node in Settings before
            creating containers. Storage and network options will not be
            available.
          </AlertDescription>
        </Alert>
      )}

      <WizardStepper currentStep={step} completedSteps={completedSteps} />

      {step === 1 && (
        <TemplateStep
          templates={templates}
          data={templateData}
          onNext={handleTemplateNext}
        />
      )}

      {step === 2 && (
        <ConfigureStep
          data={configData}
          defaultsFromTemplate={selectedTemplate}
          storages={storages}
          bridges={bridges}
          nextVmid={nextVmid}
          onNext={handleConfigNext}
          onBack={handleBack}
        />
      )}

      {step === 3 && (
        <PackagesStep
          data={packagesData}
          templatePackages={selectedTemplate?.packages ?? []}
          onNext={handlePackagesNext}
          onBack={handleBack}
        />
      )}

      {step === 4 && (
        <ScriptsStep
          data={scriptsData}
          templateScripts={selectedTemplate?.scripts ?? []}
          onNext={handleScriptsNext}
          onBack={handleBack}
        />
      )}

      {step === 5 && (
        <ReviewStep
          templateName={templateData?.templateName ?? null}
          config={configData}
          packages={packagesData}
          scripts={scriptsData}
          templatePackages={selectedTemplate?.packages ?? []}
          isPending={isPending}
          onDeploy={handleDeploy}
          onBack={handleBack}
        />
      )}
    </div>
  );
}
