import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
import { listSevereRepairEstimates } from "../../api/maintenance";
import { capNotice, listCapInfo } from "../../lib/list-cap";
import { entityLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

/**
 * The route's own maximum (units.routes.ts). Named rather than inlined so the cap and the truncation
 * check can never drift apart — the CLS-SILENT-CAP failure mode is a literal in the fetch that nothing
 * downstream knows about.
 */
const UNITS_FETCH_CAP = 500;

type OosUnitRow = {
  unitId: string;
  unitNumber: string;
  reason: string;
  etaBack: string;
  statusLabel: string;
};

type UnitRecord = {
  id?: string;
  unit_number?: string;
  status?: string;
  is_oos?: boolean;
  oos_reason?: string | null;
  has_open_pm_due_wo?: boolean;
  is_dispatch_blocked?: boolean;
};

const IN_SHOP_STATUSES = new Set(["InMaintenance", "OutOfService", "Damaged"]);

function formatEta(value: string | null | undefined): string {
  if (!value) return "TBD";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return "TBD";
  return parsed.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function statusLabelForUnit(unit: UnitRecord): string {
  if (unit.is_oos || unit.status === "OutOfService") return "Out of service";
  if (unit.has_open_pm_due_wo || unit.is_dispatch_blocked || unit.status === "InMaintenance") return "In shop";
  if (unit.status === "Damaged") return "Damaged";
  return "Unavailable";
}

type Props = {
  operatingCompanyId: string;
};

export function FleetOosStrip({ operatingCompanyId }: Props) {
  const enabled = Boolean(operatingCompanyId);

  const unitsQuery = useQuery({
    queryKey: ["dispatch", "fleet-oos-units", operatingCompanyId],
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId, limit: UNITS_FETCH_CAP }),
    enabled,
    refetchInterval: 60_000,
  });

  const severeQuery = useQuery({
    queryKey: ["dispatch", "fleet-oos-severe", operatingCompanyId],
    queryFn: () => listSevereRepairEstimates(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

  // CLS-SILENT-CAP: the units endpoint returns a real server-side `total`, so truncation here is EXACT
  // rather than inferred. Computed from the SAME constant the fetch uses, so the two cannot drift.
  const unitsCap = useMemo(
    () =>
      listCapInfo(
        unitsQuery.data?.units?.length ?? 0,
        UNITS_FETCH_CAP,
        (unitsQuery.data as { total?: number } | undefined)?.total ?? null,
      ),
    [unitsQuery.data],
  );

  const rows = useMemo(() => {
    const byUnitId = new Map<string, OosUnitRow>();

    for (const raw of unitsQuery.data?.units ?? []) {
      const unit = raw as UnitRecord;
      const unitId = String(unit.id ?? "");
      if (!unitId) continue;

      const inShop =
        Boolean(unit.is_oos) ||
        Boolean(unit.has_open_pm_due_wo) ||
        Boolean(unit.is_dispatch_blocked) ||
        (unit.status != null && IN_SHOP_STATUSES.has(String(unit.status)));

      if (!inShop) continue;

      byUnitId.set(unitId, {
        unitId,
        unitNumber: entityLabel(unit.unit_number, unitId, "Unit"),
        // Only a REAL recorded reason. This used to fall back to `unit.status`, which put the raw
        // enum "OutOfService" on the card directly beneath the label that already says "Out of
        // service" — 13 units on prod showed the enum, because none of them has an oos_reason. An
        // empty string renders nothing (see below); inventing a sentence the operator never wrote
        // would be worse than showing no reason at all.
        reason: String(unit.oos_reason ?? "").trim(),
        etaBack: "TBD",
        statusLabel: statusLabelForUnit(unit),
      });
    }

    for (const estimate of severeQuery.data?.data ?? []) {
      if (!estimate.is_oos) continue;
      const existing = byUnitId.get(estimate.unit_id);
      const reason = estimate.description?.trim() || existing?.reason || "Severe repair — out of service";
      const etaBack = formatEta(estimate.estimated_completion_date);
      byUnitId.set(estimate.unit_id, {
        unitId: estimate.unit_id,
        unitNumber: entityLabel(estimate.unit_number, estimate.unit_id, "Unit") ?? existing?.unitNumber,
        reason,
        etaBack,
        statusLabel: existing?.statusLabel ?? "Out of service",
      });
    }

    return [...byUnitId.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [severeQuery.data?.data, unitsQuery.data?.units]);

  if (!enabled) return null;
  const fleetReadFailed = unitsQuery.isError || severeQuery.isError;
  const failedFeeds = [unitsQuery.isError ? "unit roster" : null, severeQuery.isError ? "repair estimates" : null]
    .filter(Boolean)
    .join(" and ");

  return (
    <div
      className="mt-3 rounded-sm border border-slate-200 bg-slate-100/95 shadow-xs"
      data-testid="dispatch-fleet-oos-strip"
    >
      <div className="flex items-center justify-between gap-2 border-b border-slate-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-700">
          Fleet OOS / In shop ({unitsQuery.isLoading || severeQuery.isLoading ? "…" : fleetReadFailed ? "—" : rows.length})
        </span>
        {/*
          CLS-SILENT-CAP: this strip fetches `limit: UNITS_FETCH_CAP` and used to claim "full fleet
          visibility" unconditionally. That claim is not the component's to make — beyond the cap the
          fleet is silently invisible, and a promise of completeness is worse than a plain cap because
          it actively tells the dispatcher not to look further. Prod carries 183 units today so the
          claim happens to hold; it stops holding the moment the fleet outgrows the cap, and nothing
          would have surfaced that. The label now states what is actually known.
        */}
        <span className="text-[10px] text-slate-700">
          {unitsCap.truncated ? capNotice(unitsCap, "units") : "Pinned — full fleet visibility"}
        </span>
      </div>
      {fleetReadFailed ? (
        <div className="p-3" data-fleet-oos-read-error>
          <ListErrorState
            status={0}
            message={`Could not load ${failedFeeds}. Fleet availability was not treated as all units in service.`}
            onRetry={() => {
              if (unitsQuery.isError) void unitsQuery.refetch();
              if (severeQuery.isError) void severeQuery.refetch();
            }}
          />
        </div>
      ) : unitsQuery.isLoading || severeQuery.isLoading ? (
        <div className="px-3 py-2 text-xs text-slate-700">Loading out-of-service units…</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-slate-700">All units in service.</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 py-2">
          {rows.map((row) => (
            <div
              key={row.unitId}
              className="min-w-[200px] shrink-0 rounded-sm border border-slate-200 bg-white px-2.5 py-2 text-[11px]"
              data-testid={`fleet-oos-unit-${row.unitNumber}`}
            >
              <div className="flex items-center justify-between gap-2">
                <EntityLink
                  kind="unit"
                  id={row.unitId}
                  label={entityLabel(row.unitNumber, row.unitId, "Unit")}
                  className="font-semibold text-gray-900"
                  data-testid="fleet-oos-unit-link"
                />
                <span className="rounded-sm bg-slate-100 px-1.5 py-0.5 text-[10px] font-semibold text-slate-700">
                  {row.statusLabel}
                </span>
              </div>
              {row.reason ? <div className="mt-1 text-gray-700">{row.reason}</div> : null}
              <div className="mt-1 text-gray-500">
                ETA back: <span className="font-medium text-gray-800">{row.etaBack}</span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
