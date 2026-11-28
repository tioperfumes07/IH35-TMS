/**
 * Concentration check (owner 2026-11-27 20:59 CT: "NIGHT DIVE WILL BE EDT … ON SETS, COMPARE TO ALL LISTS AND LIST THOSE. MOST ARE
 * EDT."). Fragrance items with no concentration, what every list says (the same fragrance on another item, and the vendors' own lines),
 * and how many agree. Tick and apply — or apply all the agreed ones — through the item file's bulk edit (a history row per item).
 * Body mists, roll-ons, fresheners, pens, bags, pouches, deodorants, after-shave, candles, diffusers, cosmetics, accessories, hair
 * care, displays, blotters and boxes have no concentration and are not listed.
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ParityTable } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { userFacingApiError } from "../../lib/api-error-message";
import { bulkEditPerfumeItems, getPerfumeConcCheck, type PerfumeConcRow } from "../../api/perfume";
import { DASH } from "./perfumeDocParts";

const PAGE = 200;
const ctl = "h-[28px] rounded-sm border border-[#C6D1DC] px-1 text-xs";
const btn = "h-[28px] rounded-sm border border-[#1F2A44] bg-white px-2 text-xs font-semibold text-[#1F2A44] disabled:opacity-50";
const TYPES = ["Set", "Tester", "Regular", "Mini", "Sample / Vial", "(none)"];
type Conc = "EDT" | "EDP" | "PARFUM" | "EXTRAIT" | "EDC";

/** Sets each row's agreed concentration, 500 at a time; a batch the item file refuses (e.g. the new name is already another item) is
 *  retried one by one so one refusal never stops the rest — the refused ones are counted and stay listed. */
async function applyRows(rows: PerfumeConcRow[]): Promise<{ done: number; refused: string[] }> {
  const by = new Map<string, string[]>();
  for (const r of rows) if (r.proposed) by.set(r.proposed, [...(by.get(r.proposed) ?? []), r.id]);
  let done = 0;
  const refused: string[] = [];
  for (const [conc, ids] of by) for (let i = 0; i < ids.length; i += 500) {
    const chunk = ids.slice(i, i + 500);
    try { await bulkEditPerfumeItems({ ids: chunk, set: { conc: conc as Conc } }); done += chunk.length; }
    catch {
      for (const id of chunk) {
        try { await bulkEditPerfumeItems({ ids: [id], set: { conc: conc as Conc } }); done++; } catch { refused.push(id); }
      }
    }
  }
  return { done, refused };
}

export function PerfumeConcCheck() {
  const qc = useQueryClient();
  const { pushToast } = useToast();
  const [type, setType] = useState("Set");
  const [status, setStatus] = useState<"proposed" | "conflict" | "none" | "">("");
  const [page, setPage] = useState(0);
  const [busy, setBusy] = useState<string | null>(null);
  const f = { product_type: type || undefined, status: status || undefined };
  const q = useQuery({ queryKey: ["perfume", "conc-check", f, page], queryFn: () => getPerfumeConcCheck({ ...f, limit: PAGE, offset: page * PAGE }) });
  const d = q.data;
  const refresh = () => qc.invalidateQueries({ queryKey: ["perfume"] });
  const apply = async (rows: PerfumeConcRow[]) => {
    setBusy("Saving…");
    try { const r = await applyRows(rows); pushToast(`${r.done} concentration${r.done === 1 ? "" : "s"} set${r.refused.length ? ` · ${r.refused.length} refused by the item file (still listed)` : ""}`, "success"); await refresh(); }
    catch (e) { pushToast(userFacingApiError(e, "Not saved"), "error"); } finally { setBusy(null); }
  };
  const applyAll = async () => {
    let n = 0;
    const refused = new Set<string>();
    try {
      for (let off = 0, k = 0; k < 200; k++) {
        // Set rows leave the list; refused ones stay, so read past them.
        const chunk = await getPerfumeConcCheck({ ...f, status: "proposed", limit: 500, offset: off });
        if (!chunk.rows.length) break;
        const todo = chunk.rows.filter((r) => !refused.has(r.id));
        if (!todo.length) { off += chunk.rows.length; continue; }
        const r = await applyRows(todo);
        n += r.done; r.refused.forEach((id) => refused.add(id));
        setBusy(`Setting concentrations… ${n.toLocaleString("en-US")} done · ${refused.size} refused`);
      }
      pushToast(`${n.toLocaleString("en-US")} concentrations set${refused.size ? ` · ${refused.size} refused by the item file (still listed)` : ""}`, "success");
    } catch (e) { pushToast(userFacingApiError(e, `Stopped after ${n}`), "error"); } finally { setBusy(null); await refresh(); }
  };
  return (
    <div className="space-y-2 rounded-[3px] border border-[#D8E0E8] p-3" data-testid="perfume-conc-check">
      <div className="text-xs font-bold uppercase text-[#14314F]">Concentration check — compared with every list</div>
      <div className="flex flex-wrap items-end gap-2 text-xs">
        <label>Type{" "}
          <select className={ctl} value={type} onChange={(e) => { setType(e.target.value); setPage(0); }} data-testid="perfume-conc-type">
            <option value="">All fragrances</option>{TYPES.map((t) => <option key={t} value={t}>{t === "(none)" ? "No type" : t}</option>)}
          </select>
        </label>
        <label>Lists say{" "}
          <select className={ctl} value={status} onChange={(e) => { setStatus(e.target.value as typeof status); setPage(0); }} data-testid="perfume-conc-status">
            <option value="">Everything</option><option value="proposed">One concentration</option><option value="conflict">Disagree</option><option value="none">Nothing</option>
          </select>
        </label>
        <button type="button" className={btn} disabled={!!busy || !d?.counts.proposed} onClick={() => void applyAll()} data-testid="perfume-conc-apply-all">
          {`Set all ${(d?.counts.proposed ?? 0).toLocaleString("en-US")} the lists agree on`}
        </button>
      </div>
      <div className="text-xs text-gray-700" data-testid="perfume-conc-count">
        {d ? `${d.total.toLocaleString("en-US")} items · lists agree on ${d.counts.proposed.toLocaleString("en-US")} · disagree on ${d.counts.conflict.toLocaleString("en-US")} · say nothing on ${d.counts.none.toLocaleString("en-US")} · showing ${d.rows.length ? page * PAGE + 1 : 0}–${page * PAGE + d.rows.length}` : ""}
        {d && d.total > PAGE ? (
          <span className="ml-2">
            <button type="button" className="underline disabled:opacity-40" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</button>{" · "}
            <button type="button" className="underline disabled:opacity-40" disabled={(page + 1) * PAGE >= d.total} onClick={() => setPage((p) => p + 1)}>Next</button>
          </span>
        ) : null}
      </div>
      {busy ? <div className="text-xs font-semibold text-[#1F2A44]" data-testid="perfume-conc-busy">{busy}</div> : null}
      {/* TABLE_DATE_OMIT: a concentration check — each row is an item and what the vendor lists say about it, not a dated event. */}
      <ParityTable<PerfumeConcRow> selectable
        rows={d?.rows ?? []} rowKey={(r) => r.id} loading={q.isLoading} storageKey="perfume-conc-check-v1" exportFilename="TIO concentration check" exportExcel
        hidePager page={1} pageSize={PAGE} emptyText="Nothing to check."
        batchActions={(sel) => <button type="button" className={btn} disabled={!!busy || !sel.some((r) => r.proposed)} onClick={() => void apply(sel)} data-testid="perfume-conc-apply">{`Set the lists' concentration (${sel.filter((r) => r.proposed).length})`}</button>}
        columns={[
          { className: "text-left", key: "display_name", sortable: true, label: "Item", render: (r) => r.display_name, exportValue: (r) => r.display_name },
          { className: "text-left", key: "product_type", sortable: true, label: "Type", render: (r) => r.product_type || DASH, exportValue: (r) => r.product_type },
          { className: "text-left", key: "proposed", sortable: true, label: "Lists say", render: (r) => r.proposed ?? (r.concs ? `Disagree: ${r.concs}` : "Nothing"), exportValue: (r) => r.proposed ?? r.concs ?? "" },
          { key: "agree_n", sortable: true, label: "Agreeing", kind: "number", cellClass: "text-right tabular-nums", render: (r) => r.agree_n.toLocaleString("en-US"), exportValue: (r) => r.agree_n },
          { className: "text-left", key: "evidence", sortable: true, label: "Seen as", render: (r) => r.evidence.join(" · ") || DASH, exportValue: (r) => r.evidence.join(" | ") },
        ]}
      />
    </div>
  );
}
