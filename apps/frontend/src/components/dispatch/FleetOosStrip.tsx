import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { listUnits } from "../../api/mdata";
import { listSevereRepairEstimates } from "../../api/maintenance";

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
    queryFn: () => listUnits({ operating_company_id: operatingCompanyId }),
    enabled,
    refetchInterval: 60_000,
  });

  const severeQuery = useQuery({
    queryKey: ["dispatch", "fleet-oos-severe", operatingCompanyId],
    queryFn: () => listSevereRepairEstimates(operatingCompanyId),
    enabled,
    refetchInterval: 60_000,
  });

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
        unitNumber: String(unit.unit_number ?? unitId),
        reason: String(unit.oos_reason ?? unit.status ?? "Unavailable for dispatch"),
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
        unitNumber: estimate.unit_number ?? existing?.unitNumber ?? estimate.unit_id,
        reason,
        etaBack,
        statusLabel: existing?.statusLabel ?? "Out of service",
      });
    }

    return [...byUnitId.values()].sort((a, b) => a.unitNumber.localeCompare(b.unitNumber, undefined, { numeric: true }));
  }, [severeQuery.data?.data, unitsQuery.data?.units]);

  if (!enabled) return null;

  return (
    <div
      className="sticky bottom-0 z-20 mt-3 rounded border border-amber-300 bg-amber-50/95 shadow-sm backdrop-blur-sm"
      data-testid="dispatch-fleet-oos-strip"
    >
      <div className="flex items-center justify-between gap-2 border-b border-amber-200 px-3 py-1.5">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-900">
          Fleet OOS / In shop ({unitsQuery.isLoading || severeQuery.isLoading ? "…" : rows.length})
        </span>
        <span className="text-[10px] text-amber-800">Pinned — full fleet visibility</span>
      </div>
      {unitsQuery.isLoading || severeQuery.isLoading ? (
        <div className="px-3 py-2 text-xs text-amber-800">Loading out-of-service units…</div>
      ) : rows.length === 0 ? (
        <div className="px-3 py-2 text-xs text-amber-800">All units in service.</div>
      ) : (
        <div className="flex gap-2 overflow-x-auto px-3 py-2">
          {rows.map((row) => (
            <div
              key={row.unitId}
              className="min-w-[200px] shrink-0 rounded border border-amber-200 bg-white px-2.5 py-2 text-[11px]"
              data-testid={`fleet-oos-unit-${row.unitNumber}`}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="font-semibold text-gray-900">{row.unitNumber}</span>
                <span className="rounded bg-amber-100 px-1.5 py-0.5 text-[10px] font-semibold text-amber-900">
                  {row.statusLabel}
                </span>
              </div>
              <div className="mt-1 text-gray-700">{row.reason}</div>
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
