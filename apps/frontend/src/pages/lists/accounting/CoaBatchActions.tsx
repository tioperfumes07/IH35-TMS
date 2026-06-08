import { useMemo, useState } from "react";
import { chartOfAccountsCatalogClient } from "../../../api/catalogs-accounting";
import { deactivateCatalogAccount } from "../../../api/coa-list";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
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

  const selectedRows = useMemo(
    () => rows.filter((row) => selectedIds.includes(row.id)),
    [rows, selectedIds]
  );

  const mergeSources = useMemo(
    () => selectedRows.filter((row) => row.id !== mergeTargetId),
    [mergeTargetId, selectedRows]
  );

  const handleMakeInactive = async () => {
    if (selectedIds.length === 0) return;
    const confirmed = window.confirm(
      `Make ${selectedIds.length} account${selectedIds.length === 1 ? "" : "s"} inactive? Archived accounts are never deleted.`
    );
    if (!confirmed) return;

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

  const handleMerge = async () => {
    if (!mergeTargetId || mergeSources.length === 0) return;
    const target = selectedRows.find((row) => row.id === mergeTargetId);
    const confirmed = window.confirm(
      `Merge ${mergeSources.length} account${mergeSources.length === 1 ? "" : "s"} into "${target?.name ?? "selected target"}"? Source accounts will be archived (never deleted).`
    );
    if (!confirmed) return;

    setBusy(true);
    setError("");
    try {
      for (const source of mergeSources) {
        try {
          await chartOfAccountsCatalogClient.deactivate(source.id, operatingCompanyId);
        } catch {
          await deactivateCatalogAccount(source.id);
        }
      }
      setMergeOpen(false);
      setMergeTargetId("");
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
        <Button type="button" disabled={busy || selectedIds.length === 0} onClick={() => void handleMakeInactive()}>
          Make inactive
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={busy || selectedIds.length < 2}
          onClick={() => {
            setMergeTargetId(selectedRows[0]?.id ?? "");
            setMergeOpen(true);
          }}
        >
          Merge accounts
        </Button>
        {error ? <span className="text-xs text-red-600">{error}</span> : null}
      </div>

      <Modal
        open={mergeOpen}
        title="Merge accounts"
        onClose={() => {
          if (busy) return;
          setMergeOpen(false);
        }}
      >
        <div className="space-y-3 text-sm">
          <p className="text-slate-600">
            Choose the surviving account. Other selected accounts will be archived via the existing catalog deactivate service.
          </p>
          <label className="block space-y-1">
            <span className="text-xs font-medium text-slate-700">Surviving account</span>
            <select
              className="h-9 w-full rounded border border-gray-300 px-2"
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
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" disabled={busy} onClick={() => setMergeOpen(false)}>
              Cancel
            </Button>
            <Button type="button" disabled={busy || !mergeTargetId || mergeSources.length === 0} onClick={() => void handleMerge()}>
              Merge
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
