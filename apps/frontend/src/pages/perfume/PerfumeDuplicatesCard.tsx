/**
 * TIO Perfumes · Contacts · Duplicate companies — owner 2026-11-27 16:32 CT: "as vendor it is one company and contacts there are
 * multiple". Every company name on more than one record (same match key) is listed with the record that stays and the ones merged into
 * it; Merge moves people, documents, accounts and links to the one company and keeps the others as its locations (never deleted).
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { getPerfumeDuplicates, mergeOnePerfumeDuplicate, mergePerfumeDuplicates, type PerfumeDupGroup, type PerfumeDupMember } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { usDate } from "./perfumeDocParts";

export function PerfumeDuplicatesCard({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const [open, setOpen] = useState(false);
  const q = useQuery({ queryKey: ["perfume", "duplicates"], queryFn: getPerfumeDuplicates, enabled: open });
  const [off, setOff] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [view, setView] = useState<PerfumeDupGroup | null>(null);
  const picked = useMemo(() => (q.data?.rows ?? []).filter((g) => !off.has(g.key)).map((g) => g.key), [q.data, off]);
  const merge = async () => {
    setBusy(true);
    try {
      let groups = 0, merged = 0;
      for (let i = 0; i < picked.length; i += 100) {
        const r = await mergePerfumeDuplicates(picked.slice(i, i + 100));
        groups += r.groups; merged += r.merged;
      }
      pushToast(`${groups.toLocaleString("en-US")} companies cleaned — ${merged.toLocaleString("en-US")} duplicate records kept as their locations`, "success");
      setOff(new Set()); await q.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not merged"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-duplicates" aria-label={tr("perfume.dups.title", "Duplicate companies")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{tr("perfume.dups.title", "Duplicate companies — one company, many contacts")}</div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {open && q.data ? <span>{`${q.data.groups.toLocaleString("en-US")} ${tr("perfume.dups.names", "companies on more than one record")} · ${q.data.extra.toLocaleString("en-US")} ${tr("perfume.dups.extra", "extra records")}`}</span> : null}
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={() => setOpen(!open)} data-testid="perfume-dups-open">{open ? tr("perfume.dups.hide", "Hide") : tr("perfume.dups.review", "Review duplicates")}</Button>
          {open ? <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !picked.length} onClick={() => void merge()} data-testid="perfume-dups-merge">{`${tr("perfume.dups.merge", "Merge picked")} (${picked.length})`}</Button> : null}
        </div>
      </div>
      {open ? (q.isError ? <ListErrorState title={tr("perfume.dups.error", "Couldn't load duplicates")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <ParityTable<PerfumeDupGroup>
          rows={q.data?.rows ?? []} rowKey={(g) => g.key} loading={q.isLoading} storageKey="perfume-dups-v1" exportFilename="TIO duplicate companies" exportExcel
          emptyText="No duplicate companies — every company is one record."
          columns={[
            { key: "pick", label: "Merge", render: (g) => <input type="checkbox" aria-label={`Merge ${g.name}`} checked={!off.has(g.key)}
              onChange={(e) => { const n = new Set(off); if (e.target.checked) n.delete(g.key); else n.add(g.key); setOff(n); }} /> },
            { className: "text-left", cellClass: "text-left font-semibold", key: "name", label: "Company that stays", sortable: true, render: (g) => (
              <button type="button" className="text-left font-semibold text-[#1D4ED8] hover:underline" onClick={() => setView(g)} data-testid={`perfume-dups-view-${g.key}`}>{g.keep.name}</button>),
              exportValue: (g) => g.keep.name },
            { key: "companies", label: "Records", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (g) => String(g.companies) },
            { className: "text-left", cellClass: "text-left", key: "role", label: "Type", render: (g) => [g.keep, ...g.merge].map((m) => m.role ?? "—").filter((v, i, a) => a.indexOf(v) === i).join(" + "),
              exportValue: (g) => [g.keep, ...g.merge].map((m) => m.role ?? "").join(" ") },
            { className: "text-left", cellClass: "text-left", key: "locations", label: "Becomes its locations", render: (g) => g.merge.map((m) => [m.name !== g.keep.name ? m.name : null, m.city, m.state].filter(Boolean).join(", ") || "—").join(" · "),
              exportValue: (g) => g.merge.map((m) => `${m.name} ${m.city ?? ""}`).join(" | ") },
            { key: "people", label: "People", kind: "number", cellClass: "text-right tabular-nums", render: (g) => String([g.keep, ...g.merge].reduce((s, m) => s + m.people, 0)) },
            { key: "created_date", label: "First record", sortable: true, cellClass: "text-right tabular-nums", render: (g) => usDate(g.keep.created_at.slice(0, 10)), exportValue: (g) => g.keep.created_at.slice(0, 10) },
          ]}
        />
      )) : null}
      {view ? <PerfumeDupGroupModal group={view} onClose={() => setView(null)} onMerged={async () => { setView(null); await q.refetch(); onDone(); }} /> : null}
    </section>
  );
}

/**
 * Owner 2026-11-27 17:25 CT: "I CLICK ON VITAMIN SHOP, IT SHOULD POP UP, AND SHOW ME ALL THE DUPLICATES SO I CAN CONFIRM" (QuickBooks-style
 * pop-up). Every record of the company, side by side: which one stays (radio), which ones merge into it (checkbox), then Confirm.
 */
function PerfumeDupGroupModal({ group, onClose, onMerged }: { group: PerfumeDupGroup; onClose: () => void; onMerged: () => Promise<void> }) {
  const { pushToast } = useToast();
  const all: PerfumeDupMember[] = [group.keep, ...group.merge];
  const [keep, setKeep] = useState(group.keep.id);
  const [out, setOut] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const ids = all.filter((m) => m.id !== keep && !out.has(m.id)).map((m) => m.id);
  const confirm = async () => {
    setBusy(true);
    try {
      const r = await mergeOnePerfumeDuplicate(keep, ids);
      pushToast(`${all.find((m) => m.id === keep)?.name ?? "Company"}: ${r.merged} record(s) merged and kept as its locations`, "success");
      await onMerged();
    } catch (e) { pushToast(userFacingApiError(e, "Not merged"), "error"); } finally { setBusy(false); }
  };
  return (
    <Modal open onClose={onClose} title={`${group.keep.name} — ${all.length} records`} size="lg" data-testid="perfume-dups-modal">
      <div className="space-y-3">
        <p className="text-xs text-[#374151]">{tr("perfume.dups.modal_help", "Pick the record that stays. The others merge into it: their people, documents, accounts and links move to it and they stay as its locations (nothing is deleted).")}</p>
        <ParityTable<PerfumeDupMember>
          rows={all} rowKey={(m) => m.id} storageKey="perfume-dups-modal-v1" exportFilename={`TIO duplicates ${group.keep.name}`} exportExcel emptyText="No records."
          columns={[
            { key: "stays", label: "Stays", render: (m) => <input type="radio" name="perfume-dup-keep" aria-label={`${m.name} stays`} checked={keep === m.id} onChange={() => setKeep(m.id)} /> },
            { key: "merge", label: "Merge", render: (m) => m.id === keep ? "—" : <input type="checkbox" aria-label={`Merge ${m.name}`} checked={!out.has(m.id)}
              onChange={(e) => { const n = new Set(out); if (e.target.checked) n.delete(m.id); else n.add(m.id); setOut(n); }} /> },
            { className: "text-left", cellClass: "text-left font-semibold", key: "name", label: "Name", sortable: true, render: (m) => m.name, exportValue: (m) => m.name },
            { className: "text-left", cellClass: "text-left", key: "role", label: "Type", render: (m) => m.role ?? "—", exportValue: (m) => m.role ?? "" },
            { className: "text-left", cellClass: "text-left", key: "city", label: "City", sortable: true, render: (m) => [m.city, m.state].filter(Boolean).join(", ") || "—", exportValue: (m) => `${m.city ?? ""} ${m.state ?? ""}` },
            { key: "people", label: "People", kind: "number", cellClass: "text-right tabular-nums", render: (m) => String(m.people) },
            { key: "docs", label: "Documents", kind: "number", cellClass: "text-right tabular-nums", render: (m) => String(m.docs) },
            { key: "sx", label: "ScentsX", render: (m) => [m.sx_link ? "linked" : null, m.account ? "account" : null].filter(Boolean).join(" · ") || "—" },
            { key: "created_date", label: "Created", sortable: true, cellClass: "text-right tabular-nums", render: (m) => usDate(m.created_at.slice(0, 10)), exportValue: (m) => m.created_at.slice(0, 10) },
          ]}
        />
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" onClick={onClose}>{tr("perfume.common.cancel", "Cancel")}</Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ids.length} onClick={() => void confirm()} data-testid="perfume-dups-modal-confirm">
            {`${tr("perfume.dups.confirm", "Confirm — merge")} ${ids.length} ${tr("perfume.dups.into", "into the one that stays")}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

/** A company's locations (records merged into it), on its profile. */
export function PerfumeCompanyLocations({ rows }: { rows: Array<{ id: string; name: string; address: string | null; city: string | null; state: string | null; phone: string | null; merged_at: string | null }> }) {
  if (!rows.length) return null;
  return (
    <ParityTable
      cardTitle title={`${tr("perfume.locs.title", "Locations")} (${rows.length})`} rows={rows} rowKey={(r) => r.id} storageKey="perfume-company-locations-v1" exportFilename="TIO company locations" exportExcel emptyText="No other locations."
      columns={[
        { className: "text-left", cellClass: "text-left", key: "city", label: "City", sortable: true, render: (r) => [r.city, r.state].filter(Boolean).join(", ") || "—", exportValue: (r) => `${r.city ?? ""} ${r.state ?? ""}` },
        { className: "text-left", cellClass: "text-left", key: "address", label: "Address", render: (r) => r.address ?? "—", exportValue: (r) => r.address ?? "" },
        { className: "text-left", cellClass: "text-left", key: "phone", label: "Phone", render: (r) => r.phone ?? "—", exportValue: (r) => r.phone ?? "" },
        { className: "text-left", cellClass: "text-left", key: "name", label: "Name on that record", render: (r) => r.name, exportValue: (r) => r.name },
        { key: "merged_at", label: "Merged", cellClass: "text-right tabular-nums", render: (r) => (r.merged_at ? usDate(r.merged_at.slice(0, 10)) : "—"), exportValue: (r) => r.merged_at ?? "" },
      ]}
    />
  );
}
