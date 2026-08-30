import { useQuery } from "@tanstack/react-query";
import { getFuelTransactions } from "../../api/fuelPlanner";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

/**
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 (CC-2) — Built reverse_link on create-path surfaces.
 * fuel.fuel_transactions.load_id/driver_id/unit_id have existed since P5-D5 (Load FK Invariant) and
 * GET /api/v1/fuel/transactions?load_id=|driver_id=|unit_id=... has worked since FUEL-4, but load and
 * unit detail never surfaced it (driver detail already had one via FuelHistoryView) — the other
 * trip-cost reverse hops (expenses, WOs, claims, accidents) were all built on all three entity pages,
 * fuel was the one silent gap on load + unit. Embedded list (not link-out), matching the
 * InsuranceClaimsReverseSection filter-union convention so one component serves all four entities.
 * trailer_id added once the list endpoint accepted it (EXPENSE-FUEL-TRAILER-LIST-FILTER-MISSING,
 * closed same session — the column and create path existed since #6316, only the list filter was
 * missing, mirroring what #6324 shipped for accidents).
 */

type Filter =
  | { driver_id: string; unit_id?: never; load_id?: never; trailer_id?: never }
  | { unit_id: string; driver_id?: never; load_id?: never; trailer_id?: never }
  | { load_id: string; driver_id?: never; unit_id?: never; trailer_id?: never }
  | { trailer_id: string; driver_id?: never; unit_id?: never; load_id?: never };

const FUEL_HISTORY_KIND = {
  driver_id: "fuel_history_driver",
  unit_id: "fuel_history_unit",
  load_id: "fuel_history_load",
  trailer_id: "fuel_history_trailer",
} as const;

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  /** Short context phrase, e.g. "this load" / "this unit". */
  contextLabel: string;
  "data-testid"?: string;
};

export function FuelTransactionsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  "data-testid": testId = "fuel-transactions-reverse",
}: Props) {
  const filterKey = Object.keys(filter)[0] as keyof Filter;
  const filterValue = Object.values(filter)[0] as string;
  const fuelQ = useQuery({
    queryKey: ["fuel", "reverse", "transactions", operatingCompanyId, filter],
    queryFn: () => getFuelTransactions(operatingCompanyId, { ...filter }),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  const rows = fuelQ.data?.transactions ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Fuel transactions
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <EntityLink
          kind={FUEL_HISTORY_KIND[filterKey]}
          id={filterValue}
          label="Open Fuel History"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      {fuelQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {fuelQ.isError ? (
        <ListErrorState
          title={`Couldn't load fuel transactions for ${contextLabel}`}
          status={0}
          message={userFacingApiError(fuelQ.error, "Fuel history is unavailable")}
          onRetry={() => void fuelQ.refetch()}
        />
      ) : null}
      {!fuelQ.isLoading && !fuelQ.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No fuel transactions linked to {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`fuel-transaction-${row.id}`}>
              <span className="font-medium text-slate-900">{row.station || "Fuel stop"}</span>
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.transaction_date)} · {row.gallons == null ? "Gallons unavailable" : `${row.gallons.toLocaleString()} gal`} · {formatMoneyCents(row.amount_cents, "USD")}
                {filterKey !== "driver_id" && row.driver_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
                  </>
                ) : null}
                {filterKey !== "unit_id" && row.unit_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
                  </>
                ) : null}
                {filterKey !== "load_id" && row.load_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="load" id={row.load_id} label={entityLabel(row.load_number, row.load_id, "Load")} />
                  </>
                ) : null}
                {filterKey !== "trailer_id" && row.trailer_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="trailer" id={row.trailer_id} label={entityLabel(row.trailer_number, row.trailer_id, "Trailer")} />
                  </>
                ) : null}
                {row.vendor_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(row.vendor_name, row.vendor_id, "Vendor")} />
                  </>
                ) : null}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
