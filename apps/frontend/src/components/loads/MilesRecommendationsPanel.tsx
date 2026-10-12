// 443.55 (owner 2026-10-11 09:33 CT: "In loads it should show both recommendations historical and google and we should be
// able to select which ones for short and practical etc."). One row per miles field — Practical, Short, Empty/Deadhead —
// showing BOTH recommendations with their evidence, the difference, and a per-field selector Historical | Google | Manual.
// A source with no value says why ("no history for this lane", "Google had no route"); it is never a blank and never a 0.
// Locked scale (docs/specs/GLOBAL-TYPE-SIZE-BASELINE.md): body 12px, headers 11px/700/UPPERCASE via text-section-header.
import { useState } from "react";
import {
  MILES_FIELD_LABELS,
  type MilesChoiceInput,
  type MilesField,
  type MilesFieldRec,
  type MilesRecommendations,
  type MilesSource,
  useChooseLoadMiles,
  useLoadMilesRecommendations,
} from "../../api/milesRecommendations";
import { userFacingApiError } from "../../lib/api-error-message";

const HEADER = "text-section-header font-bold uppercase tracking-[0.4px] text-gray-600";
const SOURCE_LABEL: Record<MilesSource, string> = { historical: "Historical", google: "Google", manual: "Manual", document: "Document" };

const miles = (v: number | null | undefined) => (v == null ? null : `${Math.round(v * 10) / 10 === Math.round(v) ? Math.round(v).toLocaleString() : (Math.round(v * 10) / 10).toLocaleString()} mi`);
const day = (iso: string | null | undefined) => (iso ? new Date(iso).toLocaleDateString() : null);

type Props = {
  data: MilesRecommendations | null | undefined;
  isLoading?: boolean;
  error?: string | null;
  /** Read-only shows both recommendations and the current choice, without the selector. */
  readOnly?: boolean;
  saving?: boolean;
  /** Book Load: the choices kept in form state (the server has no row yet). */
  pending?: Partial<Record<MilesField, { source: MilesSource; value: number; reason?: string }>>;
  onChoose?: (input: MilesChoiceInput) => Promise<unknown> | void;
};

export function MilesRecommendationsPanel({ data, isLoading, error, readOnly, saving, pending, onChoose }: Props) {
  if (isLoading) return <div data-testid="miles-recs-loading" className="text-xs text-gray-500">Loading mileage recommendations…</div>;
  if (error || !data)
    return (
      <div data-testid="miles-recs-error" className="rounded-[4px] border border-gray-200 bg-white p-2 text-xs text-red-700">
        Mileage recommendations unavailable{error ? `: ${error}` : ""}
      </div>
    );
  return (
    <div data-testid="miles-recs-panel" className="overflow-x-auto rounded-[4px] border border-gray-200 bg-white">
      <div
        className="grid min-w-[720px] grid-cols-6 text-xs text-gray-900"
        role="grid"
        aria-label="Mileage recommendations"
      >
        {["Field", "Historical", "Google", "Difference", "Use", "Chosen"].map((h) => (
          <div key={h} role="columnheader" className={`border-b border-gray-200 bg-[#F7F8FA] px-2 py-1.5 text-center ${HEADER}`}>
            {h}
          </div>
        ))}
        {MILES_FIELD_LABELS.map(({ field, label }) => (
          <MilesFieldRow
            key={field}
            field={field}
            label={label}
            rec={data.fields[field]}
            readOnly={readOnly}
            saving={saving}
            pending={pending?.[field]}
            onChoose={onChoose}
          />
        ))}
      </div>
    </div>
  );
}

function MilesFieldRow({
  field,
  label,
  rec,
  readOnly,
  saving,
  pending,
  onChoose,
}: {
  field: MilesField;
  label: string;
  rec: MilesFieldRec | undefined;
  readOnly?: boolean;
  saving?: boolean;
  pending?: { source: MilesSource; value: number; reason?: string };
  onChoose?: Props["onChoose"];
}) {
  const [manualOpen, setManualOpen] = useState(false);
  const [manualValue, setManualValue] = useState("");
  const [reason, setReason] = useState("");
  const [manualError, setManualError] = useState<string | null>(null);
  if (!rec) return null;

  const chosen = pending ? { source: pending.source, value: pending.value, chosen_by: null, chosen_at: null, reason: pending.reason ?? null } : rec.current;
  const h = rec.historical;
  const g = rec.google;

  const submitManual = async () => {
    const v = Number(manualValue);
    if (!manualValue.trim() || !Number.isFinite(v) || v < 0) return setManualError("Enter the miles");
    if (!reason.trim()) return setManualError("A reason is required for a manual value");
    setManualError(null);
    await onChoose?.({ field, source: "manual", manual_value: v, reason: reason.trim() });
    setManualOpen(false);
  };

  return (
    <div className="contents" data-testid={`miles-row-${field}`}>
      <div role="row" className="contents">
      <div role="gridcell" className="border-b border-gray-200 px-2 py-1.5 font-semibold align-top">{label}</div>
      <div role="gridcell" data-testid={`miles-historical-${field}`} className="border-b border-gray-200 px-2 py-1.5 align-top">
        {h ? (
          <div>
            <div className="font-semibold">{miles(h.value)}</div>
            <div className="text-gray-600">avg of {h.n_loads} load{h.n_loads === 1 ? "" : "s"}</div>
            {h.min != null && h.max != null ? <div className="text-gray-600">range {miles(h.min)} – {miles(h.max)}</div> : null}
            {h.last_seen ? <div className="text-gray-600">last seen {day(h.last_seen)}</div> : null}
            {h.untrustworthy_reason ? <div className="font-semibold text-[#4B5563]">flagged: {h.untrustworthy_reason}</div> : null}
          </div>
        ) : (
          <span className="text-gray-600">{rec.historical_missing_reason || "no history for this lane"}</span>
        )}
      </div>
      <div role="gridcell" data-testid={`miles-google-${field}`} className="border-b border-gray-200 px-2 py-1.5 align-top">
        {g ? (
          <div>
            <div className="font-semibold">{miles(g.value)}</div>
            <div className="text-gray-600">fetched {day(g.fetched_at)}</div>
          </div>
        ) : (
          <span className="text-gray-600">{rec.google_missing_reason || "Google had no route"}</span>
        )}
      </div>
      <div role="gridcell" className="border-b border-gray-200 px-2 py-1.5 text-center align-top">{rec.difference != null ? `${rec.difference > 0 ? "+" : ""}${miles(rec.difference)}` : "—"}</div>
      <div role="gridcell" className="border-b border-gray-200 px-2 py-1.5 align-top">
        {readOnly ? (
          <span className="text-gray-600">—</span>
        ) : (
          <div className="flex flex-col gap-1">
            <div role="group" aria-label={`${label} miles source`} className="inline-flex overflow-hidden rounded-[4px] border border-gray-200">
              {(["historical", "google", "manual"] as const).map((src) => {
                const disabled = saving || (src === "historical" && !h) || (src === "google" && !g);
                const active = chosen?.source === src || (src === "manual" && manualOpen);
                return (
                  <button
                    key={src}
                    type="button"
                    data-testid={`miles-pick-${field}-${src}`}
                    disabled={disabled}
                    aria-pressed={active}
                    onClick={() => {
                      if (src === "manual") { setManualOpen(true); return; }
                      setManualOpen(false);
                      void onChoose?.({ field, source: src });
                    }}
                    className={`min-w-[72px] px-2 py-1 text-xs ${active ? "bg-[#16A34A] font-semibold text-white" : "bg-[var(--surface-unselected)] text-gray-700 hover:bg-[var(--surface-hover)]"} disabled:cursor-not-allowed disabled:opacity-40`}
                  >
                    {SOURCE_LABEL[src]}
                  </button>
                );
              })}
            </div>
            {manualOpen ? (
              <div data-testid={`miles-manual-${field}`} className="flex flex-col gap-1">
                <div className="grid grid-cols-2 gap-1">
                  <input
                    aria-label={`${label} manual miles`}
                    inputMode="decimal"
                    value={manualValue}
                    onChange={(e) => setManualValue(e.target.value)}
                    placeholder="Miles"
                    className="w-full rounded-[4px] border border-gray-200 px-2 py-1 text-xs"
                  />
                  <input
                    aria-label={`${label} manual reason`}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    placeholder="Reason (required)"
                    className="w-full rounded-[4px] border border-gray-200 px-2 py-1 text-xs"
                  />
                </div>
                {manualError ? <div role="alert" className="text-red-700">{manualError}</div> : null}
                <button
                  type="button"
                  data-testid={`miles-manual-save-${field}`}
                  disabled={saving}
                  onClick={() => void submitManual()}
                  className="self-start rounded-[4px] border border-[#16A34A] px-2 py-1 text-xs font-semibold text-[#16A34A]"
                >
                  Use manual value
                </button>
              </div>
            ) : null}
          </div>
        )}
      </div>
      <div role="gridcell" data-testid={`miles-chosen-${field}`} className="border-b border-gray-200 px-2 py-1.5 align-top">
        {chosen?.source ? (
          <div>
            <div className="font-semibold">{miles(chosen.value) ?? "—"}</div>
            <div className="text-gray-600">{SOURCE_LABEL[chosen.source]}{chosen.reason ? ` · ${chosen.reason}` : ""}</div>
            {chosen.chosen_by || chosen.chosen_at ? (
              <div className="text-gray-600">{[chosen.chosen_by, day(chosen.chosen_at)].filter(Boolean).join(" · ")}</div>
            ) : null}
          </div>
        ) : (
          <span className="text-red-700">no source recorded</span>
        )}
      </div>
      </div>
    </div>
  );
}

/** Load detail: reads the load's two recommendations and saves a per-field choice (audited server-side). */
export function LoadMilesRecommendations({ loadId, operatingCompanyId, canEdit }: { loadId: string; operatingCompanyId: string | null; canEdit: boolean }) {
  const recs = useLoadMilesRecommendations(loadId, operatingCompanyId);
  const choose = useChooseLoadMiles(loadId, operatingCompanyId);
  const errorText = recs.error ? userFacingApiError(recs.error, "could not load") : choose.error ? userFacingApiError(choose.error, "could not save the choice") : null;
  return (
    <MilesRecommendationsPanel
      data={recs.data}
      isLoading={recs.isLoading}
      error={recs.data ? (choose.error ? errorText : null) : errorText}
      readOnly={!canEdit}
      saving={choose.isPending}
      onChoose={(input) => choose.mutateAsync(input)}
    />
  );
}
