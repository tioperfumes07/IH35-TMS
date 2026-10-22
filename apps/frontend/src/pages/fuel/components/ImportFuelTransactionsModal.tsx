import { useCallback, useEffect, useRef, useState } from "react";
import { importFuelTransactions, importWexStatement } from "../../../api/fuelPlanner";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { QBO_MONEY_CELL_CLASS } from "../../../design/qbo-parity";
import type { FuelTransactionImportResult, WexStatementImportResult, WexStatementOutcome } from "../../../api/fuelPlanner";

type ImportKind = "fleet" | "wex";

// LEAD 443.202 — what each England WEX statement line will do / did, in the owner's words.
const WEX_OUTCOME_LABEL: Record<WexStatementOutcome, string> = {
  imported: "New fill — posts Dr fuel / Cr England WEX (2520)",
  adopted: "Already on a settlement — adopted, no second row",
  already_imported: "Already imported",
  held_no_load: "Held — no load covers the truck at that time",
  unresolved: "Not imported — truck or vendor not found",
  cross_rail: "Booked on another fuel card — listed only",
  amount_mismatch: "Amount differs from the booked receipt — listed only",
  pre_cutoff: "Before the card start — not posted",
  scale_adopted: "Scale ticket — already booked",
  scale_imported: "Scale ticket — new expense",
};

const money = (cents: number) => (cents / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });

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
  const [kind, setKind] = useState<ImportKind>("fleet");
  const [wexPlan, setWexPlan] = useState<WexStatementImportResult | null>(null);
  const [attemptClose, setAttemptClose] = useState<() => void>(() => () => {});
  const lifecycleGenerationRef = useRef(0);

  const resetDraft = useCallback(() => {
    setFile(null);
    setResult(null);
    setWexPlan(null);
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
    if (kind === "wex") {
      try {
        // First click: the plan (dry run, nothing written). Second click: post exactly that file.
        const res = await importWexStatement(operatingCompanyId, file, wexPlan === null);
        if (lifecycleGenerationRef.current !== submissionGeneration) return;
        if (res.dry_run) {
          setWexPlan(res);
          return;
        }
        pushToast(
          `England WEX statement posted: ${res.by_outcome.imported.lines} new, ${res.by_outcome.adopted.lines} already on settlements, ${res.by_outcome.held_no_load.lines} held`,
          "success"
        );
        onImported();
        completeClose();
      } catch (error) {
        if (lifecycleGenerationRef.current !== submissionGeneration) return;
        pushToast(userFacingApiError(error, "WEX statement import failed"), "error");
      } finally {
        if (lifecycleGenerationRef.current === submissionGeneration) setLoading(false);
      }
      return;
    }
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
        <label className="flex items-center gap-2">
          <span className="font-semibold">File</span>
          <select
            data-testid="fuel-import-kind"
            className="rounded-sm border border-gray-200 bg-white px-2 py-1"
            value={kind}
            disabled={loading}
            onChange={(event) => {
              setKind(event.target.value as ImportKind);
              setWexPlan(null);
            }}
          >
            <option value="fleet">Fleet-card export</option>
            <option value="wex">England WEX statement (TransactionReport)</option>
          </select>
        </label>
        <label
          className="block rounded-sm border-2 border-dashed border-gray-300 bg-gray-50 p-4 text-center text-gray-600"
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            const dropped = event.dataTransfer.files?.[0];
            if (dropped) {
              setFile(dropped);
              setWexPlan(null);
            }
          }}
        >
          <input
            type="file"
            accept=".xlsx,.csv"
            className="hidden"
            onChange={(event) => {
              const picked = event.target.files?.[0] ?? null;
              setFile(picked);
              setWexPlan(null);
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
        {kind === "wex" && wexPlan ? (
          <div data-testid="wex-statement-plan" className="space-y-2 rounded-sm border border-gray-200 bg-white p-3">
            <div className="font-semibold">
              Plan for {wexPlan.file}: {wexPlan.lines} lines ({wexPlan.fills} tickets) — nothing written yet
            </div>
            <table className="w-full">
              <tbody>
                {(Object.keys(WEX_OUTCOME_LABEL) as WexStatementOutcome[])
                  .filter((key) => wexPlan.by_outcome[key]?.lines > 0)
                  .map((key) => (
                    <tr key={key}>
                      <td className="py-0.5">{WEX_OUTCOME_LABEL[key]}</td>
                      <td className="py-0.5 text-right">{wexPlan.by_outcome[key].lines}</td>
                      <td className={`py-0.5 ${QBO_MONEY_CELL_CLASS}`}>{money(wexPlan.by_outcome[key].cents)}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
            {wexPlan.results.some((r) => r.outcome !== "imported" && r.outcome !== "adopted" && r.outcome !== "already_imported") ? (
              <ul className="max-h-40 list-disc space-y-1 overflow-y-auto pl-5">
                {wexPlan.results
                  .filter((r) => r.outcome !== "imported" && r.outcome !== "adopted" && r.outcome !== "already_imported")
                  .map((r) => (
                    <li key={`${r.line_number}-${r.item}`}>
                      Invoice {r.efs_invoice} {r.item} {r.local_date}: {r.reason ?? WEX_OUTCOME_LABEL[r.outcome]}
                    </li>
                  ))}
              </ul>
            ) : null}
          </div>
        ) : null}
        <div className="flex gap-2">
          <Button size="sm" variant="secondary" onClick={attemptClose} disabled={loading}>Cancel</Button>
          <Button size="sm" loading={loading} onClick={() => void submit()}>
            {kind === "wex" ? (wexPlan ? "Post WEX statement" : "Preview WEX statement") : "+ Import Fuel Transactions"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
