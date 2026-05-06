import { useState } from "react";
import { uploadLovesPrices } from "../../../api/fuelPlanner";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onUploaded: () => void;
};

export function UploadLovesPricesModal({ open, operatingCompanyId, onClose, onUploaded }: Props) {
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [etag, setEtag] = useState<string | null>(null);

  const submit = async () => {
    if (!file) {
      pushToast("Select a .xlsx file first", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await uploadLovesPrices(operatingCompanyId, file, etag);
      setEtag(res.etag);
      pushToast(`Loves upload complete: +${res.rows_added} / upd ${res.rows_updated} / skip ${res.rows_skipped}`, "success");
      onUploaded();
      onClose();
    } catch (error) {
      pushToast(String((error as Error)?.message || "Upload failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Upload Loves Prices">
      <div className="space-y-3 text-xs">
        <label
          className="block rounded border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <input
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
            }}
          />
          Drag & drop .xlsx or click to pick file
        </label>
        <div className="rounded border border-gray-200 bg-white px-2 py-1">
          Selected: <span className="font-semibold">{file?.name ?? "none"}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => void submit()}>
            + Upload Loves Prices
          </Button>
        </div>
      </div>
    </Modal>
  );
}
