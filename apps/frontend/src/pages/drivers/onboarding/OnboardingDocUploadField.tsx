type DocUploadStepProps = {
  label: string;
  testId: string;
  fileId: string;
  fileName: string;
  onPick: (file: File) => Promise<void>;
  uploading?: boolean;
  disabled?: boolean;
};

export function OnboardingDocUploadField({
  label,
  testId,
  fileId,
  fileName,
  onPick,
  uploading,
  disabled,
}: DocUploadStepProps) {
  return (
    <div data-testid={testId} className="space-y-2">
      <label className="block text-sm font-medium text-slate-700">{label}</label>
      <input
        type="file"
        accept="application/pdf,image/*"
        disabled={disabled || uploading}
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (file) await onPick(file);
        }}
        className="block w-full text-sm"
      />
      {uploading ? <p className="text-xs text-slate-500">Uploading via docs module…</p> : null}
      {fileId ? (
        <p className="text-xs text-green-700">
          Uploaded: {fileName || fileId}
        </p>
      ) : (
        <p className="text-xs text-slate-500">Upload via docs module (presigned URL)</p>
      )}
    </div>
  );
}
