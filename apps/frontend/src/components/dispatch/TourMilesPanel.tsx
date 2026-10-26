// TABLE_DATE_OMIT: this table has no date column by design — one row per MILES KIND on one tour (practical / shortest / loaded / deadhead …) comparing DB vs Google vs the load; the tour's dates live on the tour header, a miles kind has no date of its own.
import { useLoadMilesRecommendations, MILES_FIELD_LABELS, type MilesFieldRec } from "../../api/milesRecommendations";
import type { TourReadout } from "../../api/tourReadout";
import { EntityLink } from "../shared/EntityLink";
import { ParityTable } from "../parity/ParityTable";

type MilesRow = { field: (typeof MILES_FIELD_LABELS)[number]["field"]; label: string; rec: MilesFieldRec | undefined };

/**
 * LEAD 443.269-A item 3c / item 5 (owner standing order "miles everywhere"): per leg of the tour, OUR database miles
 * (AlwaysTrack lane history / catalogs.lane_mileage, via the ONE miles engine), GOOGLE shortest + practical, the REAL
 * driven miles (telematics odometer segments) and WHICH value the load (and its driver bill) uses. Reads only — the
 * engine is CC-2's miles-recommendations (no second computation here).
 */
const DASH = "—";
const mi = (n: number | null | undefined) =>
  n == null ? DASH : n.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const SOURCE_LABEL: Record<string, string> = {
  historical: "our database (lane history)",
  google: "Google",
  manual: "typed",
  document: "signed settlement document",
};

function usedLabel(rec: MilesFieldRec | undefined): string {
  const src = rec?.current?.source;
  return src ? SOURCE_LABEL[src] ?? src : "stored on the load";
}

function LegMiles({ leg, operatingCompanyId }: { leg: TourReadout["legs"][number]; operatingCompanyId: string }) {
  const q = useLoadMilesRecommendations(leg.load_id, operatingCompanyId);
  const stored: Record<string, number | null> = { practical: leg.miles_practical, short: leg.miles_shortest, empty: leg.miles_deadhead };
  return (
    <div className="ldt-card" data-testid={`tour-miles-leg-${leg.load_id}`}>
      <div className="ldt-ch">
        <span>
          {leg.trip_type ?? "Leg"} · <EntityLink kind="load" id={leg.load_id} label={leg.load_number} /> · {leg.lane || DASH}
        </span>
        <span className="ldt-open">Real driven: <b data-testid="tour-miles-real">{mi(leg.miles_real)}</b> mi</span>
      </div>
      {q.isError ? (
        <div className="ldt-note bad" data-testid="tour-miles-error">
          Could not load the miles sources for load {leg.load_number}.{" "}
          <button type="button" className="ldt-link" onClick={() => void q.refetch()}>Retry</button>
        </div>
      ) : (
        <ParityTable<MilesRow>
          tableTestId="tour-miles-table"
          appearance="board"
          hidePager
          density="compact"
          suppressToolbarSearch
          suppressToolbarRange
          rows={MILES_FIELD_LABELS.map(({ field, label }) => ({ field, label, rec: q.data?.fields[field] }))}
          rowKey={(row) => row.field}
          rowTestId={(row) => `tour-miles-row-${row.field}`}
          emptyText="No miles sources."
          columns={[
            { key: "miles", label: "Miles", sortable: true, sortValue: (row) => (row.field === "short" ? "Shortest" : row.label), render: (row) => (row.field === "short" ? "Shortest" : row.label) },
            {
              key: "db",
              label: "Our database",
              sortable: true,
              sortValue: (row) => row.rec?.historical?.value ?? -1,
              kind: "number",
              render: ({ field, rec }) => (
                <span data-testid={`tour-miles-db-${field}`} title={rec?.historical_missing_reason ?? undefined}>
                  {q.isLoading ? "…" : rec?.historical ? `${mi(rec.historical.value)} (${rec.historical.n_loads} trips)` : DASH}
                </span>
              ),
            },
            {
              key: "google",
              label: "Google",
              sortable: true,
              sortValue: (row) => row.rec?.google?.value ?? -1,
              kind: "number",
              render: ({ field, rec }) => (
                <span data-testid={`tour-miles-google-${field}`} title={rec?.google_missing_reason ?? undefined}>
                  {q.isLoading ? "…" : rec?.google ? mi(rec.google.value) : DASH}
                </span>
              ),
            },
            { key: "on_load", label: "On the load", sortable: true, sortValue: (row) => Number(row.rec?.current?.value ?? stored[row.field] ?? -1), kind: "number", render: (row) => mi(row.rec?.current?.value ?? stored[row.field]) },
            {
              key: "bill_uses",
              label: "Bill uses",
              sortable: true,
              sortValue: (row) => row.field,
              render: (row) =>
                row.field === "practical" ? "revenue per mile" : row.field === "short" ? `driver pay · ${usedLabel(row.rec)}` : `empty pay · ${usedLabel(row.rec)}`,
            },
          ]}
        />
      )}
    </div>
  );
}

export function TourMilesPanel({ legs, operatingCompanyId }: { legs: TourReadout["legs"]; operatingCompanyId: string }) {
  const active = legs.filter((l) => !l.is_cancelled);
  return (
    <div className="space-y-2" data-testid="tour-miles-panel">
      <p className="ldt-muted">
        Driver pay uses SHORTEST miles (loaded + empty); revenue per mile uses PRACTICAL. Our database = AlwaysTrack lane
        history; Google = car routing reference; real driven = telematics odometer.
      </p>
      {active.map((l) => (
        <LegMiles key={l.load_id} leg={l} operatingCompanyId={operatingCompanyId} />
      ))}
    </div>
  );
}
