/**
 * TIO Perfumes · Contacts · Format names — ROUND P1.31 L2 (owner 2026-11-27 15:47 CT: "FULL COMPANY NAME, ALL PROPER FORMAT, FIRST
 * LETTER CAPITALL LETTER THEN REGUALR ETC. SPACES, IPBGROUP IS IPB Group"). The rule (backend company-names.service.ts) proposes each
 * change; the owner unticks any he does not want and applies. Apply renames in place and writes one history row per company.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyPerfumeNameFixes, getPerfumeNameFixes, type PerfumeNameFix } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { usDate } from "./perfumeDocParts";

export function PerfumeNameFormatCard({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["perfume", "name-fixes"], queryFn: getPerfumeNameFixes, enabled: open });
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const picked = useMemo(() => (q.data?.fixes ?? []).filter((f) => !off.has(f.id)).map((f) => f.id), [q.data, off]);
  const apply = async () => {
    setBusy(true);
    try {
      const r = await applyPerfumeNameFixes(picked);
      pushToast(`${r.renamed.toLocaleString("en-US")} names formatted`, "success");
      setOff(new Set()); await q.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Names not changed"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-name-format" aria-label={tr("perfume.names.title", "Format company names")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("perfume.names.title", "Format company names")}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {open && q.data ? <span>{`${q.data.count.toLocaleString("en-US")} ${tr("perfume.names.to_fix", "names to format")} · ${picked.length.toLocaleString("en-US")} ${tr("perfume.names.picked", "picked")}`}</span> : null}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setOpen(!open)} data-testid="perfume-name-format-open">
            {open ? tr("perfume.names.hide", "Hide") : tr("perfume.names.review", "Review names")}
          </Button>
          {open ? <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !picked.length} onClick={() => void apply()} data-testid="perfume-name-format-apply">{tr("perfume.names.apply", "Apply picked")}</Button> : null}
        </div>
      </div>
      {open ? (q.isError ? <ListErrorState title={tr("perfume.names.error", "Couldn't load the names")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <ParityTable<PerfumeNameFix>
          rows={q.data?.fixes ?? []} rowKey={(f) => f.id} loading={q.isLoading} storageKey="perfume-name-format-v1"
          selectable selectedKeys={picked} onSelectionChange={(k) => { const on = new Set(k); setOff(new Set((q.data?.fixes ?? []).map((f) => f.id).filter((x) => !on.has(x)))); }} exportFilename="TIO name format preview" exportExcel
          emptyText="Every company name is already in proper format."
          columns={[
            { className: "text-left", cellClass: "text-left", key: "from", label: "Now", sortable: true, render: (f) => f.from, exportValue: (f) => f.from },
            { className: "text-left", cellClass: "text-left font-semibold", key: "to", label: "Will read", sortable: true, render: (f) => f.to, exportValue: (f) => f.to },
            { key: "added_date", label: "Added", sortable: true, cellClass: "text-right tabular-nums", render: (f) => (f.added_on ? usDate(f.added_on) : "—"), exportValue: (f) => f.added_on ?? "" },
            { className: "text-left", cellClass: "text-left", key: "role", sortable: true, label: "Type", render: (f) => f.role ?? "—", exportValue: (f) => f.role ?? "" },
          ]}
        />
      )) : null}
    </section>
  );
}
