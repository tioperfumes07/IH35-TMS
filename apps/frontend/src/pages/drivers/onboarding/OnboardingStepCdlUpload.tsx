import { OnboardingDocUploadField } from "./OnboardingDocUploadField";

type CdlUploadStepProps = {
  fileId: string;
  fileName: string;
  onUpload: (file: File) => Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
};

export function OnboardingStepCdlUpload({ onUpload, ...rest }: CdlUploadStepProps) {
  return (
    <OnboardingDocUploadField
      label="CDL scan (front/back PDF or image)"
      testId="onboarding-step-cdl-upload"
      onPick={onUpload}
      {...rest}
    />
  );
}
