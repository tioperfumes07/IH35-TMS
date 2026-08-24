import { useState } from "react";
import { importFuelTransactions } from "../../../api/fuelPlanner";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";

type Props = {
  open: boolean;
  operatingCompanyId: string;
  onClose: () => void;
  onImported: () => void;
};

// FUEL-5: History tab "Import Fuel Transactions" — wires to the existing
// POST /api/v1/fuel/transactions/import (fleet-card .xlsx/.csv, Love's/WEX/EFS/Comdata).
// Mirrors the UploadLovesPricesModal drag/drop pattern already in this module.
export function ImportFuelTransactionsModal({ open, operatingCompanyId, onClose, onImported }: Props) {
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async () => {
    if (!file) {
      pushToast("Select a .xlsx or .csv file first", "error");
      return;
    }
    setLoading(true);
    try {
      const res = await importFuelTransactions(operatingCompanyId, file);
      pushToast(
        `Fuel import complete: +${res.rows_inserted} inserted, ${res.rows_duplicate} duplicate, ${res.rows_skipped} skipped, ${res.dead_letters} rejected`,
        res.dead_letters > 0 ? "error" : "success"
      );
      onImported();
      onClose();
      setFile(null);
    } catch (error) {
      pushToast(userFacingApiError(error, "Import failed"), "error");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Import Fuel Transactions">
      <div className="space-y-3 text-xs">
        <label
          className="block rounded-sm border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) setFile(dropped);
          }}
        >
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
            }}
          />
          Drag &amp; drop a fleet-card .xlsx or .csv export or click to pick file
        </label>
        <div className="rounded-sm border border-gray-200 bg-white px-2 py-1">
          Selected: <span className="font-semibold">{file?.name ?? "none"}</span>
        </div>
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={onClose}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => void submit()}>
            + Import Fuel Transactions
          </Button>
        </div>
      </div>
    </Modal>
  );
}
