/**
 * TIO Perfumes · Contacts · Duplicate recommendations — owner 2026-11-27 17:17 CT: "AN AUTOMATICATE DUPLICATE DETECTOR ENGINE AND
 * RECOMENDATIONS … AND WE JSUT CONFIRM". The engine (backend duplicate-detector.service.ts) runs after every import / merge and when this
 * opens; each pair shows both companies side by side, why they look the same, and which one stays (switchable). Confirm merges (the other
 * becomes a location); Not a duplicate is remembered and never suggested again.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { confirmPerfumeDuplicates, dismissPerfumeDuplicates, getPerfumeDupRecommendations, type PerfumeDupCard, type PerfumeDupRec } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { DocLink, usDate } from "./perfumeDocParts";

const REASON: Record<string, string> = { same_name: "Same name", similar_name: "Similar name", same_phone: "Same phone", same_domain: "Same website / e-mail domain", same_address: "Same address" };
const where = (c: PerfumeDupCard) => [c.city, c.state].filter(Boolean).join(", ");
const Side = ({ c, stays }: { c: PerfumeDupCard; stays: boolean }) => (
  <div className={stays ? "font-semibold" : ""}>
    <DocLink tab="contacts" id={c.id}>{c.name}</DocLink>
    <div className="text-section-header font-normal text-[#64748B]">{[c.role, where(c), c.phone, c.domain, c.people ? `${c.people} people` : null].filter(Boolean).join(" · ") || "—"}</div>
  </div>
);

export function PerfumeDupRecommendations({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "dup-recs"], queryFn: getPerfumeDupRecommendations });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState<Record<string, "a" | "b">>({});
  const [busy, setBusy] = useState(false);
  const rows = q.data?.rows ?? [];
  const ids = useMemo(() => rows.filter((r) => picked.has(r.id)).map((r) => r.id), [rows, picked]);
  const act = async (kind: "confirm" | "dismiss") => {
    setBusy(true);
    try {
      if (kind === "confirm") { const r = await confirmPerfumeDuplicates(ids, keep); pushToast(`${r.merged} merged — one company each, the other kept as its location`, "success"); }
      else { const r = await dismissPerfumeDuplicates(ids); pushToast(`${r.dismissed} marked "not a duplicate" — never suggested again`, "success"); }
      setPicked(new Set()); await q.refetch(); onDone();
    } catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#D8E0E8] bg-white p-3" data-testid="perfume-dup-recs" aria-label={tr("perfume.duprec.title", "Duplicate recommendations")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="text-card-title">{`${tr("perfume.duprec.title", "Duplicate recommendations")}${q.data ? ` · ${q.data.open.toLocaleString("en-US")} ${tr("perfume.duprec.open", "to review")}` : ""}`}</div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={!rows.length} onClick={() => setPicked(picked.size === rows.length ? new Set() : new Set(rows.map((r) => r.id)))}>
            {picked.size === rows.length && rows.length ? tr("perfume.duprec.none", "Unpick all") : tr("perfume.duprec.all", "Pick all")}
          </Button>
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ids.length} onClick={() => void act("confirm")} data-testid="perfume-duprec-confirm">{`${tr("perfume.duprec.confirm", "Confirm — merge")} (${ids.length})`}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy || !ids.length} onClick={() => void act("dismiss")} data-testid="perfume-duprec-dismiss">{`${tr("perfume.duprec.dismiss", "Not a duplicate")} (${ids.length})`}</Button>
        </div>
      </div>
      {q.isError ? <ListErrorState title={tr("perfume.duprec.error", "Couldn't load the recommendations")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <ParityTable<PerfumeDupRec>
          rows={rows} rowKey={(r) => `${r.id}-${keep[r.id] ?? r.keep}`} loading={q.isLoading} storageKey="perfume-dup-recs-v1" exportFilename="TIO duplicate recommendations" exportExcel
          emptyText="No duplicates found — every company is one record."
          columns={[
            { key: "pick", label: "Pick", render: (r) => <input type="checkbox" aria-label={`Pick ${r.a.name} and ${r.b.name}`} checked={picked.has(r.id)}
              onChange={(e) => { const n = new Set(picked); if (e.target.checked) n.add(r.id); else n.delete(r.id); setPicked(n); }} data-testid={`perfume-duprec-pick-${r.id}`} /> },
            { className: "text-left", cellClass: "text-left", key: "a", label: "Company A", render: (r) => <Side c={r.a} stays={(keep[r.id] ?? r.keep) === "a"} />, exportValue: (r) => r.a.name },
            { className: "text-left", cellClass: "text-left", key: "b", label: "Company B", render: (r) => <Side c={r.b} stays={(keep[r.id] ?? r.keep) === "b"} />, exportValue: (r) => r.b.name },
            { className: "text-left", cellClass: "text-left", key: "reasons", label: "Why", render: (r) => r.reasons.map((x) => REASON[x] ?? x).join(" · "), exportValue: (r) => r.reasons.join(", ") },
            { key: "score", label: "Match", kind: "number", sortable: true, cellClass: "text-right tabular-nums", render: (r) => `${Math.round(r.score * 100)}%`, exportValue: (r) => r.score },
            { key: "keep", label: "Stays", render: (r) => (
              <select className="h-8 rounded-sm border border-[#C6D1DC] px-1 text-xs" aria-label={`Company that stays for ${r.a.name}`} value={keep[r.id] ?? r.keep} onChange={(e) => setKeep({ ...keep, [r.id]: e.target.value as "a" | "b" })}>
                <option value="a">A</option><option value="b">B</option>
              </select>), exportValue: (r) => (keep[r.id] ?? r.keep).toUpperCase() },
            { key: "first_seen_date", label: "Found", sortable: true, cellClass: "text-right tabular-nums", render: (r) => usDate(r.first_seen_at.slice(0, 10)), exportValue: (r) => r.first_seen_at.slice(0, 10) },
          ]}
        />
      )}
    </section>
  );
}
