/**
 * TIO Perfumes · Catalogs · Clean up — owner 2026-11-27 17:35 CT: "SHOULDNT THE ITEM PRODUCT TYPES BE REGULAR, TESTER, SET, MINI, DUPES,
 * SAMPLE, VIAL … AND THEN THE GENDER ASSIGNED FROM THE GENDER CATALOG? AND CUSTOMER TYPES SHOULD BE CLEANER". A pop-up (QuickBooks-style)
 * with every proposed merge: which list, the value, what it becomes, why, how many items / companies move. Tick, then Apply.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyPerfumeCatalogCleanup, getPerfumeCatalogCleanup, type PerfumeCleanupRow } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { usDate } from "./perfumeDocParts";

export function PerfumeCatalogCleanup({ onDone }: { onDone: () => void }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button type="button" className="h-[34px] px-3 text-xs" onClick={() => setOpen(true)} data-testid="perfume-catalogs-cleanup">{tr("perfume.cleanup.open", "Clean up the catalogs")}</Button>
      {open ? <CleanupModal onClose={() => setOpen(false)} onDone={onDone} /> : null}
    </>
  );
}

function CleanupModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "catalog-cleanup"], queryFn: getPerfumeCatalogCleanup });
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const todo = useMemo(() => (q.data?.rows ?? []).filter((r) => !r.done), [q.data]);
  const keys = todo.filter((r) => !off.has(r.key)).map((r) => r.key);
  const apply = async () => {
    setBusy(true);
    try {
      const r = await applyPerfumeCatalogCleanup(keys);
      pushToast(`${r.applied} values merged — ${r.moved.toLocaleString("en-US")} items / companies moved, with history`, "success");
      await q.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not applied"), "error"); } finally { setBusy(false); }
  };
  const adds = (q.data?.adds ?? []).filter((a) => !a.exists);
  return (
    <Modal open onClose={onClose} title={tr("perfume.cleanup.title", "Clean up the catalogs")} size="lg" data-testid="perfume-cleanup-modal">
      <div className="space-y-3 text-xs">
        <p>{tr("perfume.cleanup.help", "Product types keep only the kind (Regular, Tester, Set, Mini …); the gender stays in the Gender list, already on every item. Overlapping customer and vendor types merge into one. Every item and company moves with a history row; the old value is archived, never deleted.")}</p>
        {adds.length ? <p data-testid="perfume-cleanup-adds">{`${tr("perfume.cleanup.adds", "Also added")}: ${adds.map((a) => `${a.value} (${a.list})`).join(" · ")}`}</p> : null}
        {q.isError ? <ListErrorState title={tr("perfume.cleanup.error", "Couldn't load the cleanup")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
          <ParityTable<PerfumeCleanupRow>
            rows={todo} rowKey={(r) => r.key} loading={q.isLoading} storageKey="perfume-cleanup-v1"
            selectable selectedKeys={keys} onSelectionChange={(k) => { const on = new Set(k); setOff(new Set(todo.map((r) => r.key).filter((x) => !on.has(x)))); }} exportFilename="TIO catalog cleanup" exportExcel emptyText="Nothing left to clean — every row is done."
            columns={[
              { className: "text-left", cellClass: "text-left", key: "list", label: "List", sortable: true, render: (r) => r.list, exportValue: (r) => r.list },
              { className: "text-left", cellClass: "text-left", key: "from", label: "Value now", sortable: true, render: (r) => r.from, exportValue: (r) => r.from },
              { className: "text-left", cellClass: "text-left font-semibold", key: "to", label: "Becomes", sortable: true, render: (r) => r.to, exportValue: (r) => r.to },
              { className: "text-left", cellClass: "text-left", key: "why", label: "Why", render: (r) => r.why, exportValue: (r) => r.why },
              { key: "carriers", label: "Items / companies", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => r.carriers.toLocaleString("en-US"), exportValue: (r) => r.carriers },
              { key: "counted_date", label: "Counted on", cellClass: "text-right tabular-nums", render: (r) => usDate(r.counted_on), exportValue: (r) => r.counted_on },
            ]}
          />
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.common.close", "Close")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !keys.length} onClick={() => void apply()} data-testid="perfume-cleanup-apply">{`${tr("perfume.cleanup.apply", "Apply picked")} (${keys.length})`}</Button>
        </div>
      </div>
    </Modal>
  );
}
