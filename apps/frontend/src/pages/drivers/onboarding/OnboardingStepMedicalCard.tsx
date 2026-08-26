import { OnboardingDocUploadField } from "./OnboardingDocUploadField";
import { DatePicker } from "../../../components/forms/DatePicker";

type MedicalCardStepProps = {
  expiresAt: string;
  fileId: string;
  fileName: string;
  onChangeExpiry: (value: string) => void;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
};

export function OnboardingStepMedicalCard({
  expiresAt,
  fileId,
  fileName,
  onChangeExpiry,
  onUpload,
  uploading,
  disabled,
}: MedicalCardStepProps) {
  return (
    <div data-testid="onboarding-step-medical-card" className="space-y-4">
      <div className="block text-sm">
        <span className="mb-1 block font-medium text-slate-700">Medical card expiry</span>
        <DatePicker
          className="w-full"
          value={expiresAt}
          disabled={disabled}
          onChange={(next) => onChangeExpiry(next)}
        />
      </div>
      <OnboardingDocUploadField
        label="DOT medical card document"
        testId="onboarding-step-medical-card-upload"
        fileId={fileId}
        fileName={fileName}
        onPick={onUpload}
        uploading={uploading}
        disabled={disabled}
      />
    </div>
  );
}
