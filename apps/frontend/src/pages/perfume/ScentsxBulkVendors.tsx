/**
 * ROUND L.31 M23 — bulk "Make ScentsX vendor" (owner 2026-11-27 22:54 CT "… customers vendors suppliers … fully total and complete").
 * Every TIO buying supplier (perfume.vendors kind "buy") that is not yet ScentsX LLC's vendor becomes one — the SAME two canonical calls
 * the one-at-a-time button makes (ScentsxVendorLink): the canonical vendor create (POST /api/v1/mdata/vendors for ScentsX's company)
 * and the link (POST /api/v1/scentsx/vendor-links, which also screens the vendor against OFAC). When a ScentsX vendor with that exact
 * name already exists (409 mdata_vendor_name_conflict) it is linked instead of duplicated. One at a time, in order, with a result row
 * per supplier; nothing is written for a supplier already linked. Confirm first (pop-up, owner 17:25 CT).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { userFacingApiError } from "../../lib/api-error-message";
import { ApiError, apiRequest } from "../../api/client";
import { createScentsxVendor, getScentsxCompany, linkScentsxVendor, type ScentsxLink } from "../../api/scentsx";
import { listVendors } from "../../api/catalog-vendors";
import type { PerfumeVendor } from "../../api/perfume";
import { tr } from "./perfumeI18n";

/** The routes are rate-limited per minute: a 429 waits the server's Retry-After (default 30 s) and tries that one call again, up to 3 times. */
async function withRetry<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try { return await fn(); } catch (e) {
      if (!(e instanceof ApiError) || e.status !== 429 || attempt >= 3) throw e;
      await new Promise((res) => setTimeout(res, (e.retryAfter ?? 30) * 1000));
    }
  }
}

type Result = { id: string; name: string; outcome: "created" | "linked_existing" | "failed"; detail: string };

export async function makeScentsxVendors(companyId: string, suppliers: PerfumeVendor[], onEach: (r: Result) => void): Promise<Result[]> {
  const out: Result[] = [];
  for (const s of suppliers) {
    let r: Result;
    try {
      let engineId: string | null = null;
      let outcome: Result["outcome"] = "created";
      try {
        const created = await withRetry(() => createScentsxVendor(companyId, s.name));
        engineId = created.id ?? created.vendor?.id ?? null;
      } catch (e) {
        const code = e instanceof ApiError ? (e.data as { error?: string } | null)?.error : undefined;
        if (code !== "mdata_vendor_name_conflict") throw e;
        const found = await listVendors({ operating_company_id: companyId, search: s.name, limit: 50 });
        const exact = found.vendors.find((v) => (v.name ?? "").trim().toLowerCase() === s.name.trim().toLowerCase());
        if (!exact) throw e;
        engineId = String(exact.id);
        outcome = "linked_existing";
      }
      if (!engineId) throw new Error("The vendor was created but its id did not come back");
      const id = engineId;
      const link = await withRetry(() => linkScentsxVendor(s.id, id));
      r = { id: s.id, name: s.name, outcome, detail: link.screening ? `OFAC: ${link.screening.result.replace(/_/g, " ")}` : "linked" };
    } catch (e) {
      r = { id: s.id, name: s.name, outcome: "failed", detail: userFacingApiError(e, "Not created") };
    }
    out.push(r);
    onEach(r);
  }
  return out;
}

export function ScentsxBulkVendors({ suppliers, selectedIds }: { suppliers: PerfumeVendor[]; selectedIds: string[] }) {
  const co = useQuery({ queryKey: ["scentsx", "company"], queryFn: getScentsxCompany });
  const links = useQuery({ queryKey: ["scentsx", "vendor-links", "all"], queryFn: () => apiRequest<{ links: ScentsxLink[] }>("/api/v1/scentsx/vendor-links") });
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const linked = new Set((links.data?.links ?? []).filter((l) => !l.voided_at).map((l) => l.desk_id));
  const pool = (selectedIds.length ? suppliers.filter((s) => selectedIds.includes(s.id)) : suppliers).filter((s) => s.kind === "buy");
  const todo = pool.filter((s) => !linked.has(s.id));
  const companyId = co.data?.company.id ?? "";
  const go = async () => {
    setBusy(true);
    setResults([]);
    try { await makeScentsxVendors(companyId, todo, (r) => setResults((x) => [...x, r])); } finally { setBusy(false); void links.refetch(); }
  };
  const label = selectedIds.length ? tr("scentsx.bulkv.make_sel", "Make ScentsX vendor — selected") : tr("scentsx.bulkv.make_all", "Make ScentsX vendor — every supplier");
  return (
    <>
      <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!companyId || links.isLoading} onClick={() => { setResults([]); setOpen(true); }} data-testid="scentsx-bulk-vendors">
        {`${label} (${todo.length})`}</Button>
      {open ? (
        <Modal open onClose={() => { if (!busy) setOpen(false); }} title={tr("scentsx.bulkv.title", "Make ScentsX vendors")} size="md" data-testid="scentsx-bulk-vendors-modal">
          <div className="space-y-3 text-xs">
            <p>{`${todo.length} ${tr("scentsx.bulkv.todo", "supplier(s) become ScentsX LLC vendors (A/P), each screened against OFAC.")} ${pool.length - todo.length} ${tr("scentsx.bulkv.already", "already linked — left as they are.")}`}</p>
            {/* TABLE_DATE_OMIT: a run result — one row per supplier and what happened to it, not a dated event. */}
            {results.length ? (
              <ParityTable<Result> selectable rows={results} rowKey={(r) => r.id} storageKey="scentsx-bulk-vendors-v1" exportFilename="ScentsX vendors made" exportExcel emptyText="—"
                columns={[
                  { className: "text-left", cellClass: "text-left font-semibold", key: "name", sortable: true, label: "Supplier", render: (r) => r.name, exportValue: (r) => r.name },
                  { className: "text-left", cellClass: "text-left", key: "outcome", sortable: true, label: "Result", render: (r) => (r.outcome === "created" ? "Created + linked" : r.outcome === "linked_existing" ? "Linked to the existing vendor" : "NOT done"), exportValue: (r) => r.outcome },
                  { className: "text-left", cellClass: "text-left", key: "detail", sortable: true, label: "Detail", render: (r) => r.detail, exportValue: (r) => r.detail },
                ]} />
            ) : null}
            {results.length ? <p data-testid="scentsx-bulk-vendors-summary">{`${results.filter((r) => r.outcome !== "failed").length} ${tr("scentsx.bulkv.done", "done")} · ${results.filter((r) => r.outcome === "failed").length} ${tr("scentsx.bulkv.failed", "not done")} · ${todo.length - results.length} ${tr("scentsx.bulkv.left", "left")}`}</p> : null}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => setOpen(false)}>{tr("scentsx.bulkv.close", "Close")}</Button>
              <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !todo.length || results.length > 0} onClick={() => void go()} data-testid="scentsx-bulk-vendors-go">
                {busy ? tr("scentsx.bulkv.working", "Working…") : `${tr("scentsx.bulkv.go", "Make")} ${todo.length}`}</Button>
            </div>
          </div>
        </Modal>
      ) : null}
    </>
  );
}
