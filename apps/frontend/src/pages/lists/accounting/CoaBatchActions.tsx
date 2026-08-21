import { useMemo, useState } from "react";
import { chartOfAccountsCatalogClient } from "../../../api/catalogs-accounting";
import {
  COA_MERGE_REASON_MIN_LENGTH,
  deactivateCatalogAccount,
  mergeCatalogAccounts,
} from "../../../api/coa-list";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import type { CoaListRow } from "./coa-list-utils";

type Props = {
  selectedIds: string[];
  rows: CoaListRow[];
  operatingCompanyId: string;
  onComplete: () => void;
};

export function CoaBatchActions({ selectedIds, rows, operatingCompanyId, onComplete }: Props) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [mergeOpen, setMergeOpen] = useState(false);
  const [mergeTargetId, setMergeTargetId] = useState("");
  const [mergeReason, setMergeReason] = useState("");
  // NO-NATIVE-DIALOGS-U6 — window.confirm freezes Live Chrome browser automation; ConfirmModal
  // (in-app yes/no shell) replaces it, same make-inactive contract.
  const [makeInactiveOpen, setMakeInactiveOpen] = useState(false);

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const mergeSources = useMemo(
    () => selectedRows.filter((row) => row.id !== mergeTargetId),
    [mergeTargetId, selectedRows]
  );

  // Blueprint MUST 3.18.4.3 step 2 — same account type or the merge is refused server-side
  // (E_MERGE_ACCOUNT_TYPE_MISMATCH). Surfaced here so the operator sees it before submitting.
  const targetRow = selectedRows.find((row) => row.id === mergeTargetId);
  const mismatchedTypes = useMemo(
    () => (targetRow ? mergeSources.filter((row) => row.acct_type !== targetRow.acct_type) : []),
    [mergeSources, targetRow]
  );

  const reasonTooShort = mergeReason.trim().length < COA_MERGE_REASON_MIN_LENGTH;
  const canSubmitMerge =
    !busy && Boolean(mergeTargetId) && mergeSources.length > 0 && !reasonTooShort && mismatchedTypes.length === 0;

  const closeMerge = () => {
    setMergeOpen(false);
    setMergeTargetId("");
    setMergeReason("");
  };

  const handleMakeInactive = async () => {
    if (selectedIds.length === 0) return;

    setBusy(true);
    setError("");
    try {
      for (const id of selectedIds) {
        try {
          await chartOfAccountsCatalogClient.deactivate(id, operatingCompanyId);
        } catch {
          await deactivateCatalogAccount(id);
        }
      }
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to make accounts inactive");
    } finally {
      setBusy(false);
    }
  };

  // ACCT-R-03 — this used to loop the DEACTIVATE endpoint over the sources, which archived rows and
  // called it a merge: child accounts kept an archived parent and every config pointer (item default
  // accounts, role bindings, expense-category map, banking rules, …) kept designating an account
  // nobody could post to. It now calls the real merge endpoint, which does that repointing, writes
  // the append-only merge record, and archives the source in one transaction.
  const handleMerge = async () => {
    if (!canSubmitMerge || !mergeTargetId) return;

    setBusy(true);
    setError("");
    try {
      await mergeCatalogAccounts({
        targetAccountId: mergeTargetId,
        sourceAccountIds: mergeSources.map((row) => row.id),
        operatingCompanyId,
        reason: mergeReason.trim(),
      });
      closeMerge();
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to merge accounts");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        <Button type="button" disabled={busy || selectedIds.length === 0} onClick={() => setMakeInactiveOpen(true)}>
          Make inactive
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || selectedIds.length < 2}
          onClick={() => {
            setMergeTargetId(selectedRows[0]?.id ?? "");
            setMergeReason("");
            setError("");
            setMergeOpen(true);
          }}
        >
          Merge accounts
        </Button>
        {error ? <span className="text-xs text-slate-700">{error}</span> : null}
      </div>

      <Modal
        open={mergeOpen}
        title="Merge accounts"
        onClose={() => {
          if (busy) return;
          closeMerge();
        }}
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Choose the surviving account. Sub-accounts of the merged accounts are reparented onto it, and every
            place that designates a merged account for future postings — item default accounts, account role
            bindings, expense category mappings, banking rules — is repointed to it.
          </p>
          <p className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
            <strong>Posted history stays where it is.</strong> Journal entries, bills, invoices and expenses already
            posted to a merged account keep pointing at that account, so prior-period reports do not change. The
            merged accounts are archived — never deleted — and stop accepting new postings. Merging is Owner-only
            and is recorded permanently in the account merge log.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Surviving account</span>
            <select
              className="h-9 w-full rounded-sm border border-gray-300 px-2"
              value={mergeTargetId}
              onChange={(event) => setMergeTargetId(event.target.value)}
              disabled={busy}
            >
              {selectedRows.map((row) => (
                <option key={row.id} value={row.id}>
                  {row.number} · {row.name}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">
              Reason (required, at least {COA_MERGE_REASON_MIN_LENGTH} characters)
            </span>
            <textarea
              className="w-full rounded-sm border border-gray-300 px-2 py-1"
              rows={3}
              value={mergeReason}
              onChange={(event) => setMergeReason(event.target.value)}
              disabled={busy}
              placeholder="Why are these accounts being consolidated?"
            />
          </label>
          {mergeTargetId && reasonTooShort ? (
            <p className="text-xs text-slate-500">
              {Math.max(0, COA_MERGE_REASON_MIN_LENGTH - mergeReason.trim().length)} more character(s) needed.
            </p>
          ) : null}
          {mismatchedTypes.length > 0 ? (
            <p className="text-xs text-slate-700">
              Accounts of a different type cannot be merged: {mismatchedTypes.map((row) => row.number).join(", ")} are
              not {targetRow?.acct_type}.
            </p>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={closeMerge}>
              Cancel
            </Button>
            <Button type="button" disabled={!canSubmitMerge} onClick={() => void handleMerge()}>
              Merge
            </Button>
          </div>
        </div>
      </Modal>

      <ConfirmModal
        open={makeInactiveOpen}
        title="Make accounts inactive"
        message={`Make ${selectedIds.length} account${selectedIds.length === 1 ? "" : "s"} inactive? Archived accounts are never deleted.`}
        confirmLabel="Make inactive"
        onClose={() => setMakeInactiveOpen(false)}
        onConfirm={handleMakeInactive}
      />
    </>
  );
}
