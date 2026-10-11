/**
 * Lead 443.57 (owner 2026-10-11): "for the mileage it should also be the same in settlement creator".
 *
 * Per Creator load, for Practical / Short / Empty: the settlement's own miles (DOCUMENT — the pay miles), CC-2's two
 * recommendations (HISTORICAL lane average with its evidence, GOOGLE driving distance), and the source of the LOAD's saved
 * operating miles: Document | Historical | Google | Manual (reason required). Driver pay is always rate × the settlement's
 * miles and never moves with this choice. The values come from the one mileage engine (api/milesRecommendations); this
 * panel computes nothing.
 */
import type { MilesField, MilesRecommendations } from "../../api/milesRecommendations";
import { MILES_FIELDS } from "../../api/milesRecommendations";

export type CreatorMilesFieldChoice = { source: "document" | "historical" | "google" | "manual"; manual_value?: number | null; reason?: string | null };
export type CreatorMilesChoice = Partial<Record<MilesField, CreatorMilesFieldChoice>>;
export type CreatorSavedMiles = Record<MilesField, { value: number | null; source: string | null }>;

const LABEL: Record<MilesField, string> = { practical: "Practical", short: "Short", empty: "Empty" };
const th = "h-[30px] px-2 text-center text-section-header font-bold uppercase text-[#1F2937]";
const td = "px-2 py-1 align-top text-xs text-gray-900";
const sub = "text-xs text-[#4B5563]";
const fmt = (n: number | null | undefined) => (n == null ? null : n.toLocaleString("en-US", { maximumFractionDigits: 1 }));

export function CreatorMilesChoicePanel({
  idx,
  rec,
  loading,
  error,
  documentValues,
  choice,
  saved,
  onChange,
}: {
  idx: number;
  rec: MilesRecommendations | null | undefined;
  loading: boolean;
  error: string | null;
  documentValues: Record<MilesField, number | null | undefined>;
  choice: CreatorMilesChoice | null | undefined;
  /** What the preview rehearsal saved on the load (value + source), when a preview has run. */
  saved: CreatorSavedMiles | null | undefined;
  onChange: (next: CreatorMilesChoice) => void;
}) {
  const set = (f: MilesField, c: CreatorMilesFieldChoice) => onChange({ ...(choice ?? {}), [f]: c });
  return (
    <div className="mt-2 rounded-sm border border-[#E5E7EB] bg-white" data-testid={`sc-load-miles-choice-${idx}`}>
      <div className="flex items-center justify-between border-b border-[#E5E7EB] px-2 py-1">
        <span className="text-section-header font-bold uppercase text-[#4B5563]">Load miles — source</span>
        <span className={sub}>Driver pay = rate × the settlement&apos;s miles; this choice sets only the load&apos;s saved operating miles.</span>
      </div>
      {error ? (
        <div className="px-2 py-1 text-xs font-semibold text-slate-700" data-testid={`sc-load-miles-choice-error-${idx}`}>
          Recommendations unavailable: {error}
        </div>
      ) : null}
      <table className="w-full border-collapse">
        <thead>
          <tr className="border-b border-[#E5E7EB] bg-[#EEF2F6]">
            <th className={th}>Field</th>
            <th className={th}>Document (pay)</th>
            <th className={th}>Historical</th>
            <th className={th}>Google</th>
            <th className={`${th} w-[170px]`}>Use for the load</th>
          </tr>
        </thead>
        <tbody>
          {MILES_FIELDS.map((f) => {
            const r = rec?.fields[f];
            const doc = documentValues[f] ?? null;
            const c = choice?.[f] ?? { source: "document" as const };
            const h = r?.historical ?? null;
            const g = r?.google ?? null;
            const s = saved?.[f];
            return (
              <tr key={f} className="border-b border-[#E5E7EB] last:border-b-0" data-testid={`sc-load-miles-row-${idx}-${f}`}>
                <td className={`${td} whitespace-nowrap font-semibold`}>{LABEL[f]}</td>
                <td className={`${td} text-center`}>{fmt(doc) ?? <span className={sub}>not on the settlement</span>}</td>
                <td className={`${td} text-center`} data-testid={`sc-load-miles-historical-${idx}-${f}`}>
                  {loading ? (
                    <span className={sub}>Looking up…</span>
                  ) : !rec ? (
                    <span className={sub}>Set pickup + delivery to compare</span>
                  ) : h ? (
                    <>
                      <div>{fmt(h.value)}</div>
                      <div className={sub}>
                        avg of {h.n_loads} load{h.n_loads === 1 ? "" : "s"}
                        {h.min != null && h.max != null ? ` · ${fmt(h.min)}–${fmt(h.max)}` : ""}
                        {h.last_seen ? ` · last ${String(h.last_seen).slice(0, 10)}` : ""}
                      </div>
                      {h.untrustworthy_reason ? <div className="text-xs font-semibold text-slate-700">{h.untrustworthy_reason}</div> : null}
                    </>
                  ) : (
                    <span className={sub}>{r?.historical_missing_reason ?? "no history for this lane"}</span>
                  )}
                </td>
                <td className={`${td} text-center`} data-testid={`sc-load-miles-google-${idx}-${f}`}>
                  {loading ? (
                    <span className={sub}>Looking up…</span>
                  ) : !rec ? (
                    <span className={sub}>Set pickup + delivery to compare</span>
                  ) : g ? (
                    <>
                      <div>{fmt(g.value)}</div>
                      <div className={sub}>fetched {String(g.fetched_at).slice(0, 10)}</div>
                    </>
                  ) : (
                    <span className={sub}>{r?.google_missing_reason ?? "Google had no route"}</span>
                  )}
                </td>
                <td className={td}>
                  <select
                    className="w-full rounded-sm border border-[#E5E7EB] px-1 py-0.5 text-xs"
                    value={c.source}
                    aria-label={`${LABEL[f]} miles source`}
                    data-testid={`sc-load-miles-source-${idx}-${f}`}
                    onChange={(e) => {
                      const v = e.target.value as CreatorMilesFieldChoice["source"];
                      set(f, v === "manual" ? { source: "manual", manual_value: c.manual_value ?? doc ?? null, reason: c.reason ?? "" } : { source: v });
                    }}
                  >
                    <option value="document" disabled={doc == null}>Document{doc != null ? ` (${fmt(doc)})` : ""}</option>
                    <option value="historical" disabled={!h}>Historical{h ? ` (${fmt(h.value)})` : ""}</option>
                    <option value="google" disabled={!g}>Google{g ? ` (${fmt(g.value)})` : ""}</option>
                    <option value="manual">Manual</option>
                  </select>
                  {c.source === "manual" ? (
                    <div className="mt-1 grid grid-cols-2 gap-1">
                      <input
                        type="number"
                        min={0}
                        step="0.1"
                        className="rounded-sm border border-[#E5E7EB] px-1 py-0.5 text-xs"
                        value={c.manual_value ?? ""}
                        aria-label={`${LABEL[f]} manual miles`}
                        data-testid={`sc-load-miles-manual-${idx}-${f}`}
                        onChange={(e) => set(f, { ...c, manual_value: e.target.value === "" ? null : Number(e.target.value) })}
                      />
                      <input
                        type="text"
                        className="rounded-sm border border-[#E5E7EB] px-1 py-0.5 text-xs"
                        placeholder="Reason (required)"
                        value={c.reason ?? ""}
                        aria-label={`${LABEL[f]} manual miles reason`}
                        data-testid={`sc-load-miles-reason-${idx}-${f}`}
                        onChange={(e) => set(f, { ...c, reason: e.target.value })}
                      />
                    </div>
                  ) : null}
                  {s && s.value != null ? (
                    <div className={sub} data-testid={`sc-load-miles-saved-${idx}-${f}`}>
                      Preview saves {fmt(s.value)} ({s.source})
                    </div>
                  ) : null}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
