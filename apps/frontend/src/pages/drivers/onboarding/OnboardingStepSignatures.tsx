import { OnboardingDocUploadField } from "./OnboardingDocUploadField";

type SignaturesStepProps = {
  acknowledged: boolean;
  fileId: string;
  fileName: string;
  onAcknowledge: (value: boolean) => void;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
};

export function OnboardingStepSignatures({
  acknowledged,
  fileId,
  fileName,
  onAcknowledge,
  onUpload,
  uploading,
  disabled,
}: SignaturesStepProps) {
  return (
    <div data-testid="onboarding-step-signatures" className="space-y-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={acknowledged}
          disabled={disabled}
          onChange={(e) => onAcknowledge(e.target.checked)}
        />
        <span>Driver acknowledges company policies and electronic signature consent.</span>
      </label>
      <OnboardingDocUploadField
        label="Signed policy packet (optional scan)"
        testId="onboarding-step-signatures-upload"
        fileId={fileId}
        fileName={fileName}
        onPick={onUpload}
        uploading={uploading}
        disabled={disabled}
      />
    </div>
  );
}
