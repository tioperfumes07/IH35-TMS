import { OnboardingDocUploadField } from "./OnboardingDocUploadField";

const DQF_DOC_TYPES = [
  { key: "mvr", label: "MVR report" },
  { key: "psp", label: "PSP report" },
  { key: "employment_verification", label: "Employment verification" },
] as const;

type DqfDocsStepProps = {
  docs: Record<string, { file_id?: string; file_name?: string }>;
  onUpload: (docKey: string, file: File) => Promise<void>;
  uploadingKey?: string | null;
  disabled?: boolean;
};

export function OnboardingStepDqfDocs({ docs, onUpload, uploadingKey, disabled }: DqfDocsStepProps) {
  return (
    <div data-testid="onboarding-step-dqf-docs" className="space-y-4">
      <p className="text-sm text-slate-600">Upload DQF supporting documents via the docs module.</p>
      {DQF_DOC_TYPES.map(({ key, label }) => (
        <OnboardingDocUploadField
          key={key}
          label={label}
          testId={`onboarding-step-dqf-${key}`}
          fileId={docs[key]?.file_id ?? ""}
          fileName={docs[key]?.file_name ?? ""}
          onPick={(file) => onUpload(key, file)}
          uploading={uploadingKey === key}
          disabled={disabled}
        />
      ))}
    </div>
  );
}
