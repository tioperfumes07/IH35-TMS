import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { getFuelTransactions } from "../../api/fuelPlanner";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "./constants";
import { EntityLink } from "../shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";

/**
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 (CC-2) — Built reverse_link on create-path surfaces.
 * fuel.fuel_transactions.load_id has existed since P5-D5 (Load FK Invariant) and GET
 * /api/v1/fuel/transactions?load_id=... has worked since FUEL-4, but LoadDetailDrawer never
 * surfaced it — the load's other trip-cost reverse hops (expenses, WOs, claims, accidents) were all
 * built, fuel was the one silent gap. Embedded list (not link-out), matching the LoadSafetyReverseSection
 * pattern: real EntityLinks for driver/unit/vendor, both-ways drill.
 */

type Props = {
  operatingCompanyId: string;
  loadId: string;
  "data-testid"?: string;
};

export function LoadFuelReverseSection({
  operatingCompanyId,
  loadId,
  "data-testid": testId = "load-detail-fuel-transactions",
}: Props) {
  const fuelQ = useQuery({
    queryKey: ["fuel", "reverse", "transactions", "load", operatingCompanyId, loadId],
    queryFn: () => getFuelTransactions(operatingCompanyId, { load_id: loadId }),
    enabled: Boolean(operatingCompanyId) && Boolean(loadId),
  });
  const rows = fuelQ.data?.transactions ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">
          Fuel transactions
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <Link className="text-xs font-semibold text-slate-700 underline" to="/fuel/history">
          Open Fuel History
        </Link>
      </div>
      {fuelQ.isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {fuelQ.isError ? <p className="text-sm text-red-600">Could not load fuel transactions for this load.</p> : null}
      {!fuelQ.isLoading && !fuelQ.isError && rows.length === 0 ? (
        <p className="text-sm text-gray-500">No fuel transactions linked to this load.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-sm text-slate-700" data-testid={`load-fuel-transaction-${row.id}`}>
              <span className="font-medium text-slate-900">{row.station || "Fuel stop"}</span>
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.transaction_date)} · {row.gallons.toLocaleString()} gal · {formatMoneyCents(row.amount_cents, "USD")}
                {row.driver_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
                  </>
                ) : null}
                {row.unit_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="unit" id={row.unit_id} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />
                  </>
                ) : null}
                {row.vendor_id ? (
                  <>
                    {" · "}
                    <EntityLink kind="vendor" id={row.vendor_id} label={entityLabel(null, row.vendor_id, "Vendor")} />
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
