type DriverDocumentUploadFieldProps = {
  label: string;
  onFileSelected: (file: File | null) => void;
};

export function DriverDocumentUploadField({ label, onFileSelected }: DriverDocumentUploadFieldProps) {
  return (
    <label className="flex flex-col gap-2 text-sm font-medium text-gray-700">
      {label}
      <input
        type="file"
        className="rounded-md border border-gray-300 bg-white px-2 py-1 text-sm"
        onChange={(event) => {
          onFileSelected(event.target.files?.[0] ?? null);
        }}
      />
    </label>
  );
}
