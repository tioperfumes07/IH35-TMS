import { useState } from "react";
import { uploadBankStatementCsv } from "../../api/banking";
import { ActionButton } from "../shared/ActionButton";
import { useToast } from "../Toast";

type Props = {
  bankAccountId: string;
  onUploaded: () => void;
};

export function StatementUpload({ bankAccountId, onUploaded }: Props) {
  const { pushToast } = useToast();
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);

  return (
    <div className="rounded border border-gray-200 bg-white p-3">
      <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">Statement upload (CSV)</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          type="file"
          accept=".csv,text/csv"
          onChange={(event) => {
            const next = event.target.files?.[0] ?? null;
            setSelectedFile(next);
          }}
          className="text-xs text-gray-700"
        />
        <ActionButton
          disabled={!selectedFile || !bankAccountId || uploading}
          onClick={() => {
            if (!selectedFile || !bankAccountId) return;
            setUploading(true);
            void uploadBankStatementCsv(selectedFile, bankAccountId)
              .then((res) => {
                pushToast(`Statement imported: ${res.added} row(s)`, "success");
                if (res.errors.length > 0) {
                  pushToast(`Skipped ${res.errors.length} invalid row(s)`, "info");
                }
                onUploaded();
              })
              .catch((error) => pushToast(String((error as Error).message || "CSV upload failed"), "error"))
              .finally(() => setUploading(false));
          }}
        >
          {uploading ? "Uploading..." : "Upload CSV"}
        </ActionButton>
      </div>
      <p className="mt-2 text-xs text-gray-500">Expected columns: date, description, amount.</p>
    </div>
  );
}

