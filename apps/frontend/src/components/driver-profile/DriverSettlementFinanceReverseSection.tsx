import { entityLabel } from "../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { listSettlementDisputes } from "../../api/driverFinance";
import { getLiabilitiesByDriver } from "../../api/liabilities";
import { EntityLink } from "../shared/EntityLink";

type Props = {
  operatingCompanyId: string;
  driverId: string;
  /** Optional test id for the section root. */
  "data-testid"?: string;
};

/**
 * LINK-F5171 (settlements:disputes, settlements:liabilities.list) — both driver_finance.*
 * record types already carry a real driver_id FK and both already have a driver-scoped backend
 * function (listSettlementDisputes({driver_id}), getLiabilitiesByDriver(driverId)), but neither
 * had a reverse section anywhere on the driver's own profile — money taken off (or disputed
 * against) a driver's settlement had no reverse surface on the driver it was taken from, same
 * root cause DriverFinesReverseSection (SAF-F16) already fixed for fines.
 *
 * Disputes have no standalone detail page of their own — SettlementDisputesTab.tsx (the
 * canonical dispute-list surface) also drills a dispute row via kind="settlement" to its parent
 * settlement, not a dispute-specific route; this section matches that same, already-established
 * pattern rather than inventing a new one.
 */
export function DriverSettlementFinanceReverseSection({
  operatingCompanyId,
  driverId,
  "data-testid": testId = "driver-settlement-finance-reverse-section",
}: Props) {
  const enabled = Boolean(operatingCompanyId) && Boolean(driverId);

  const disputesQuery = useQuery({
    queryKey: ["settlement-disputes", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => listSettlementDisputes(operatingCompanyId, { status: "all", driver_id: driverId }),
    enabled,
  });

  const liabilitiesQuery = useQuery({
    queryKey: ["liabilities", "reverse-driver", operatingCompanyId, driverId],
    queryFn: () => getLiabilitiesByDriver(driverId, operatingCompanyId),
    enabled,
  });

  const disputes = disputesQuery.data?.disputes ?? [];
  const liabilities = liabilitiesQuery.data?.liabilities ?? [];
  const isLoading = disputesQuery.isLoading || liabilitiesQuery.isLoading;
  const disputesFailed = disputesQuery.isError;
  const liabilitiesFailed = liabilitiesQuery.isError;
  const total = disputes.length + liabilities.length;

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-slate-900">Settlement disputes &amp; liabilities</h3>
        <EntityLink
          kind="settlement_disputes_driver"
          id={driverId}
          label="Open Disputes"
          className="text-xs font-semibold text-slate-700 underline"
        />
      </div>
      <p className="text-sm text-gray-600">
        Open disputes and outstanding liabilities charged to this driver.
      </p>

      {isLoading ? <p className="text-sm text-gray-500">Loading…</p> : null}
      {disputesFailed ? <p className="text-sm text-red-600">Failed to load settlement disputes.</p> : null}
      {liabilitiesFailed ? <p className="text-sm text-red-600">Failed to load liabilities.</p> : null}
      {!isLoading && !disputesFailed && !liabilitiesFailed && total === 0 ? (
        <p className="text-sm text-gray-500">No open disputes or liabilities for this driver.</p>
      ) : null}

      {disputes.length > 0 ? (
        <div data-testid="driver-settlement-disputes">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Disputes</h4>
          <ul className="mt-1 space-y-2">
            {disputes.map((d) => (
              <li key={d.id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                <EntityLink
                  kind="settlement"
                  id={d.settlement_id}
                  label={entityLabel(d.settlement_display_id ?? null, d.settlement_id, "Settlement")}
                  className="font-semibold text-slate-700"
                />
                <span className="ml-2 text-gray-600">
                  {d.dispute_category} — {d.status}
                  {typeof d.disputed_amount_cents === "number"
                    ? ` — $${(d.disputed_amount_cents / 100).toFixed(2)}`
                    : ""}
                </span>
                {d.resolution_journal_entry_id ? (
                  <span className="ml-2">
                    <EntityLink
                      kind="journal_entry"
                      id={d.resolution_journal_entry_id}
                      label="Corrective JE"
                      className="text-xs font-semibold text-slate-700 underline"
                    />
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {liabilities.length > 0 ? (
        <div data-testid="driver-liabilities">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">Liabilities</h4>
          <ul className="mt-1 space-y-2">
            {liabilities.map((l) => {
              const id = String(l.id ?? "");
              return (
                <li key={id} className="rounded-sm border border-gray-200 bg-white px-3 py-2 text-sm">
                  <EntityLink
                    kind="liability"
                    id={id}
                    label={entityLabel(l.type as string | null, id, "Liability")}
                    className="font-semibold text-slate-700"
                  />
                  <span className="ml-2 text-gray-600">
                    {String(l.display_status ?? "active")} — $
                    {Number(l.current_balance ?? 0).toFixed(2)}
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
