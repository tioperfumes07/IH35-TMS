import { OnboardingDocUploadField } from "./OnboardingDocUploadField";

type I9StepProps = {
  section1Completed: boolean;
  fileId: string;
  fileName: string;
  onSection1: (value: boolean) => void;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
};

export function OnboardingStepI9({
  section1Completed,
  fileId,
  fileName,
  onSection1,
  onUpload,
  uploading,
  disabled,
}: I9StepProps) {
  return (
    <div data-testid="onboarding-step-i9" className="space-y-4">
      <label className="flex items-start gap-2 text-sm">
        <input
          type="checkbox"
          checked={section1Completed}
          disabled={disabled}
          onChange={(e) => onSection1(e.target.checked)}
        />
        <span>I-9 Section 1 completed with driver.</span>
      </label>
      <OnboardingDocUploadField
        label="I-9 form scan"
        testId="onboarding-step-i9-upload"
        fileId={fileId}
        fileName={fileName}
        onPick={onUpload}
        uploading={uploading}
        disabled={disabled}
      />
    </div>
  );
}
