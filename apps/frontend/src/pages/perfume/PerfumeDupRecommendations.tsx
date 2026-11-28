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
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { ctl, DocLink, usDate } from "./perfumeDocParts";
import { useSearchParams } from "react-router-dom";

/** Owner 2026-11-28 13:57 CT: a company opened from Customers stays in Customers (its profile page), never sent to All leads. */
function HereTab() { const [p] = useSearchParams(); return p.get("tab") ?? "contacts"; }

const REASON: Record<string, string> = { same_name: "Same name", similar_name: "Similar name", same_phone: "Same phone", same_domain: "Same website / e-mail domain", same_address: "Same address",
  same_contact_email: "Same contact e-mail", same_contact_similar_domain: "Same contact, near-same domain", same_core_name: "Same name without notes / alias", same_brand_initials: "Same brand initials (vendors)" };
const where = (c: PerfumeDupCard) => [c.city, c.state].filter(Boolean).join(", ");
const Side = ({ c, stays }: { c: PerfumeDupCard; stays: boolean }) => (
  <div className={stays ? "font-semibold" : ""}>
    <DocLink tab={HereTab()} id={c.id}>{c.name}</DocLink>
    <div className="text-section-header font-normal text-[#64748B]">{[c.role, where(c), c.phone, c.domain, c.people ? `${c.people} people` : null].filter(Boolean).join(" · ") || "—"}</div>
  </div>
);

export function PerfumeDupRecommendations({ onDone }: { onDone: () => void }) {
  const { pushToast } = useToast();
  const q = useQuery({ queryKey: ["perfume", "dup-recs"], queryFn: getPerfumeDupRecommendations });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [keep, setKeep] = useState<Record<string, "a" | "b">>({});
  const [busy, setBusy] = useState(false);
  const [why, setWhy] = useState<string[]>([]);
  const [find, setFind] = useState("");
  const all = q.data?.rows ?? [];
  // Owner 18:21 CT: narrow to one kind of match (e.g. "Same contact e-mail") or a name, then select all on the page and merge.
  const rows = all.filter((r) => (!why.length || r.reasons.some((x) => why.includes(x)))
    && (!find.trim() || `${r.a.name} ${r.b.name}`.toLowerCase().includes(find.trim().toLowerCase())));
  const whyOpts = Object.entries(all.reduce<Record<string, number>>((m, r) => { for (const x of r.reasons) m[x] = (m[x] ?? 0) + 1; return m; }, {}))
    .map(([k, n]) => ({ value: k, label: `${REASON[k] ?? k} (${n.toLocaleString("en-US")})` }));
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
          <Button type="button" className="h-[34px] px-3 text-xs" disabled={busy || !ids.length} onClick={() => void act("confirm")} data-testid="perfume-duprec-confirm">{`${tr("perfume.duprec.confirm", "Confirm — merge")} (${ids.length})`}</Button>
          <Button type="button" variant="secondary" className="h-[34px] px-3 text-xs" disabled={busy || !ids.length} onClick={() => void act("dismiss")} data-testid="perfume-duprec-dismiss">{`${tr("perfume.duprec.dismiss", "Not a duplicate")} (${ids.length})`}</Button>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <MultiSelectDropdown label={tr("perfume.duprec.why", "Why")} allLabel="Every reason" options={whyOpts} selected={why} onChange={setWhy} data-testid="perfume-duprec-why" />
        <input type="search" className={`${ctl} w-[260px]`} aria-label={tr("perfume.duprec.find", "Find a company")} placeholder={tr("perfume.duprec.find_ph", "Find a company")} value={find} onChange={(e) => setFind(e.target.value)} />
        <span>{`${rows.length.toLocaleString("en-US")} ${tr("perfume.duprec.shown", "shown")}`}</span>
      </div>
      {q.isError ? <ListErrorState title={tr("perfume.duprec.error", "Couldn't load the recommendations")} status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} /> : (
        <ParityTable<PerfumeDupRec>
          rows={rows} rowKey={(r) => r.id} selectable selectedKeys={[...picked]} onSelectionChange={(k) => setPicked(new Set(k))} loading={q.isLoading} storageKey="perfume-dup-recs-v1" exportFilename="TIO duplicate recommendations" exportExcel
          emptyText="No duplicates found — every company is one record."
          columns={[
            { className: "text-left", cellClass: "text-left", key: "a", label: "Company A", render: (r) => <Side c={r.a} stays={(keep[r.id] ?? r.keep) === "a"} />, exportValue: (r) => r.a.name },
            { className: "text-left", cellClass: "text-left", key: "b", label: "Company B", render: (r) => <Side c={r.b} stays={(keep[r.id] ?? r.keep) === "b"} />, exportValue: (r) => r.b.name },
            { className: "text-left", cellClass: "text-left", key: "reasons", sortable: true, label: "Why", render: (r) => r.reasons.map((x) => REASON[x] ?? x).join(" · "), exportValue: (r) => r.reasons.join(", ") },
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
