import { useMemo, useState } from "react";
import { DriverDocumentUploadField } from "../../../components/FileUpload/DriverDocumentUploadField";
import { DriverSafetyProfilePanel } from "../../../components/safety/driver-safety/DriverSafetyProfilePanel";

export default function DriverSafetyProfilePage() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const selectedLabel = useMemo(() => {
    if (!selectedFile) return "No file selected";
    return selectedFile.name;
  }, [selectedFile]);

  return (
    <main className="space-y-4">
      <DriverSafetyProfilePanel
        driverName="Driver"
        driverDisplayId="DRV-0000"
        medicalExpiryPill="amber"
        dqMissingCount={0}
        trainingDueCount={0}
      />

      <section className="rounded-lg border border-gray-200 bg-white p-4">
        <h3 className="mb-2 text-base font-semibold text-gray-900">Upload Driver Document</h3>
        <DriverDocumentUploadField label="Document" onFileSelected={setSelectedFile} />
        <p className="mt-2 text-xs text-gray-500">{selectedLabel}</p>
      </section>
    </main>
  );
}
