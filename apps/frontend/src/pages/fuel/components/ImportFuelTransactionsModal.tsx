import { useCallback, useEffect, useRef, useState } from "react";
import { importFuelTransactions } from "../../../api/fuelPlanner";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import type { FuelTransactionImportResult } from "../../../api/fuelPlanner";

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
  const [result, setResult] = useState<FuelTransactionImportResult | null>(null);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const lifecycleGenerationRef = useRef(0);

  const resetDraft = useCallback(() => {
    setFile(null);
    setResult(null);
  }, []);

  useEffect(() => {
    lifecycleGenerationRef.current += 1;
    setLoading(false);
    resetDraft();
  }, [open, operatingCompanyId, resetDraft]);

  const completeClose = useCallback(() => {
    lifecycleGenerationRef.current += 1;
    setLoading(false);
    resetDraft();
    onClose();
  }, [onClose, resetDraft]);
  const handleClose = useCallback(() => {
    if (loading) return;
    completeClose();
  }, [completeClose, loading]);

  const submit = async () => {
    if (!file) {
      pushToast("Select a .xlsx or .csv file first", "error");
      return;
    }
    const submissionGeneration = lifecycleGenerationRef.current;
    setLoading(true);
    try {
      const res = await importFuelTransactions(operatingCompanyId, file);
      if (lifecycleGenerationRef.current !== submissionGeneration) return;
      setResult(res);
      pushToast(
        `Fuel import complete: +${res.rows_inserted} inserted, ${res.rows_duplicate} duplicate, ${res.rows_skipped} skipped, ${res.dead_letters} rejected`,
        res.dead_letters > 0 ? "error" : "success"
      );
      onImported();
      if (res.dead_letters === 0) completeClose();
    } catch (error) {
      if (lifecycleGenerationRef.current !== submissionGeneration) return;
      pushToast(userFacingApiError(error, "Import failed"), "error");
    } finally {
      if (lifecycleGenerationRef.current === submissionGeneration) setLoading(false);
    }
  };

  return (
    <Modal open={open} onClose={handleClose} title="Import Fuel Transactions" confirmDiscardOnClose isDirty={Boolean(file)} onRegisterAttemptClose={(next) => setAttemptClose(() => next)}>
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
        {result && result.dead_letters > 0 ? (
          <div
            data-testid="fuel-import-rejected-rows"
            role="alert"
            className="space-y-2 rounded-sm border border-red-200 bg-red-50 p-3 text-red-900"
          >
            <div className="font-semibold">
              {result.dead_letters} row{result.dead_letters === 1 ? "" : "s"} rejected — correct the source file and import it again.
            </div>
            <div>
              Showing {result.dead_letter_details.length} of {result.dead_letters} rejected rows.
            </div>
            <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
              {result.dead_letter_details.map((detail, index) => (
                <li key={`${detail.line_number}-${index}`}>
                  Line {detail.line_number}: {detail.reason}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={attemptClose} disabled={loading}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => void submit()}>
            + Import Fuel Transactions
          </Button>
        </div>
      </div>
    </Modal>
  );
}
