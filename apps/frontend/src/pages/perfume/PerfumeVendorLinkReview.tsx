/**
 * ONE COMPANY RECORD (owner 2026-11-27 17:25 CT: "WE CANNOT HAVE DATA IN MULTIPLE PLACES OR I WILL GET CONFUISED … LETS GO").
 * Every supplier / competitor price list belongs to one company in Contacts (name, address, people, vendor / customer).
 * This review lists each list not linked yet with the proposal: the company with the same name, a choice when Contacts holds
 * the same company more than once, or a new company when it holds none. The owner changes any row and links them all.
 */
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { applyPerfumeVendorLinks, getPerfumeVendorLinkPreview, listPerfumeContacts, type PerfumeLinkCandidate, type PerfumeLinkProposal } from "../../api/perfume";
import { tr } from "./perfumeI18n";
import { ctl } from "./perfumeDocParts";

const NEW = "__new__";
const FIND = "__find__";
const ACTION_TEXT: Record<PerfumeLinkProposal["action"], string> = { link: "Same name", choose: "Pick one — Contacts has it more than once", create: "Not in Contacts — a new company" };
const place = (x: { city: string | null; state: string | null; country: string | null }) => [x.city, x.state, x.country].filter(Boolean).join(", ");

export function VendorLinkReview() {
  const { pushToast } = useToast();
  const qc = useQueryClient();
  const pv = useQuery({ queryKey: ["perfume", "vendor-links"], queryFn: getPerfumeVendorLinkPreview });
  const [pick, setPick] = useState<Record<string, string>>({});
  const [names, setNames] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  // "Find another company…": any company in Contacts, not only the same-name ones (United Perfumes Panama → United Perfumes).
  const [extra, setExtra] = useState<Record<string, PerfumeLinkCandidate[]>>({});
  const [finding, setFinding] = useState<string | null>(null);
  useEffect(() => {
    const p: Record<string, string> = {}; const n: Record<string, string> = {};
    for (const x of pv.data?.proposals ?? []) { p[x.vendor_id] = x.company_id ?? NEW; n[x.vendor_id] = x.company_name; }
    setPick(p); setNames(n);
  }, [pv.data]);
  const rows = pv.data?.proposals ?? [];
  if (!pv.data || rows.length === 0) return null;
  const apply = async () => {
    setBusy(true);
    try {
      const decisions = rows.map((x) => (pick[x.vendor_id] ?? NEW) === NEW ? { vendor_id: x.vendor_id, create_name: (names[x.vendor_id] ?? x.company_name).trim() } : { vendor_id: x.vendor_id, company_id: pick[x.vendor_id]! });
      const r = await applyPerfumeVendorLinks(decisions);
      pushToast(`${r.linked} lists linked · ${r.created} companies added to Contacts`, "success");
      await Promise.all([qc.invalidateQueries({ queryKey: ["perfume", "vendor-links"] }), qc.invalidateQueries({ queryKey: ["perfume", "vendors"] }), qc.invalidateQueries({ queryKey: ["perfume", "vendor-profile"] })]);
    } catch (e) { pushToast(userFacingApiError(e, "Nothing was linked"), "error"); }
    finally { setBusy(false); }
  };
  return (
    <section className="space-y-2 rounded-[3px] border border-[#C76A0A] bg-[#FFF8EF] p-3 text-xs" data-testid="perfume-vendor-link-review" aria-label={tr("perfume.links.title", "Link every list to its company")}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <div className="text-section-header">{tr("perfume.links.title", "Link every list to its company")} · {rows.length} {tr("perfume.links.notlinked", "not linked")} · {pv.data.linked} {tr("perfume.links.linked", "linked")}</div>
          <div className="text-[#64748B]">{tr("perfume.links.help", "One company in Contacts per supplier — its name, address and people. Change any row, then link them all.")}</div>
        </div>
        <Button type="button" variant="primary" className="h-[34px] px-3 text-xs" disabled={busy} onClick={() => void apply()} data-testid="perfume-vendor-link-apply">
          {busy ? tr("perfume.links.saving", "Linking…") : `${tr("perfume.links.apply", "Link all")} ${rows.length}`}
        </Button>
      </div>
      <div className="grid grid-cols-1 gap-1 md:grid-cols-[minmax(0,2fr)_minmax(0,1.2fr)_minmax(0,3fr)]" role="list">
        {rows.map((x) => {
          const v = pick[x.vendor_id] ?? NEW;
          return (
            <div key={x.vendor_id} role="listitem" className="contents" data-testid={`perfume-vendor-link-row-${x.vendor_id}`}>
              <div className="min-w-0 py-1 text-left font-semibold">{x.vendor}{x.kind === "sell" ? <span className="ml-1 font-normal text-[#64748B]">(competitor)</span> : null}</div>
              <div className={`min-w-0 py-1 text-left ${x.action === "choose" ? "font-semibold text-[#C76A0A]" : "text-[#64748B]"}`}>{ACTION_TEXT[x.action]}</div>
              <div className="flex min-w-0 flex-wrap items-center gap-2 py-1">
                <select className={`${ctl} min-w-0 max-w-full`} value={v} aria-label={`${tr("perfume.links.company_for", "Company for")} ${x.vendor}`}
                  onChange={(e) => { if (e.target.value === FIND) { setFinding(x.vendor_id); return; } setPick((p) => ({ ...p, [x.vendor_id]: e.target.value })); }} data-testid={`perfume-vendor-link-pick-${x.vendor_id}`}>
                  {[...x.candidates, ...(extra[x.vendor_id] ?? [])].map((c) => <option key={c.id} value={c.id}>{`${c.name}${place(c) ? ` · ${place(c)}` : ""} · ${c.people} ${c.people === 1 ? "person" : "people"}${c.exact ? " · same name" : ""}`}</option>)}
                  <option value={NEW}>{tr("perfume.links.new", "New company in Contacts")}</option>
                  <option value={FIND}>{tr("perfume.links.find", "Find another company…")}</option>
                </select>
                {finding === x.vendor_id ? (
                  <CompanyFinder label={x.vendor} onPick={(c) => { setExtra((m) => ({ ...m, [x.vendor_id]: [...(m[x.vendor_id] ?? []).filter((y) => y.id !== c.id), c] })); setPick((p) => ({ ...p, [x.vendor_id]: c.id })); setFinding(null); }}
                    onClose={() => setFinding(null)} testId={`perfume-vendor-link-find-${x.vendor_id}`} />
                ) : null}
                {v === NEW ? (
                  <input className={`${ctl} w-[260px] max-w-full`} value={names[x.vendor_id] ?? ""} aria-label={`${tr("perfume.links.new_name", "New company name for")} ${x.vendor}`}
                    onChange={(e) => setNames((n) => ({ ...n, [x.vendor_id]: e.target.value }))} data-testid={`perfume-vendor-link-name-${x.vendor_id}`} />
                ) : null}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CompanyFinder({ label, onPick, onClose, testId }: { label: string; onPick: (c: PerfumeLinkCandidate) => void; onClose: () => void; testId: string }) {
  const [q, setQ] = useState("");
  const found = useQuery({ queryKey: ["perfume", "contacts", "link-find", q], queryFn: () => listPerfumeContacts({ q, limit: 12 }), enabled: q.trim().length >= 2 });
  return (
    <div className="relative" data-testid={testId}>
      <input autoFocus className={`${ctl} w-[260px] max-w-full`} value={q} onChange={(e) => setQ(e.target.value)} aria-label={`${tr("perfume.links.find_for", "Find a company in Contacts for")} ${label}`}
        onKeyDown={(e) => { if (e.key === "Escape") onClose(); }} data-testid={`${testId}-q`} />
      {q.trim().length >= 2 && (found.data?.rows?.length ?? 0) > 0 ? (
        <div className="absolute z-20 mt-1 max-h-64 w-[320px] overflow-y-auto border border-gray-300 bg-white shadow-lg" role="listbox">
          {found.data!.rows.map((r) => (
            <button key={r.id} type="button" role="option" aria-selected={false} className="block w-full px-2 py-1 text-left text-xs hover:bg-gray-100" data-testid={`${testId}-hit-${r.id}`}
              onClick={() => onPick({ id: r.id, name: r.name, role: r.role, city: r.city, state: r.state, country: r.country, people: r.people, exact: false })}>
              <span className="font-semibold">{r.name}</span> <span className="text-[#64748B]">{[r.city, r.country].filter(Boolean).join(", ")} · {r.people} {r.people === 1 ? "person" : "people"}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
