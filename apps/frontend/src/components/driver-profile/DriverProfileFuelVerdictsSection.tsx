/**
 * ORDERS DRIVER PROFILE — fuel fills attributed at fill time + E-21/E-22 verdicts (composed).
 * GET /api/v1/drivers/:id/profile/fuel
 */
import { useQuery } from "@tanstack/react-query";
import { getDriverProfileFuel, type DriverFuelFillRow } from "../../api/driver-profile-tabs";
import { formatDateTimeUS } from "../../lib/formatDate";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { useMemo } from "react";

function money(v: unknown) {
  const n = Number(v ?? 0);
  if (!Number.isFinite(n)) return "—";
  // Backend fuel.total_cost is dollars on this read model (same as fuel list).
  return `$${n.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function verdictLabel(row: DriverFuelFillRow): string {
  const parts: string[] = [];
  if (row.purchase_ineligible_reason) parts.push(`Not a purchase: ${row.purchase_ineligible_reason}`);
  else parts.push("Purchase");
  const alerts = row.fraud_alerts ?? [];
  if (alerts.length) parts.push(`E-21 fraud ×${alerts.length} (${alerts[0]?.severity ?? "alert"})`);
  else parts.push("E-21 none");
  if (row.gps_match) {
    parts.push(
      `E-22 GPS ${row.gps_match.confidence ?? "—"}${row.gps_match.distance_m != null ? ` ${Math.round(Number(row.gps_match.distance_m))}m` : ""}`,
    );
  } else parts.push("E-22 no match");
  return parts.join(" · ");
}

export function DriverProfileFuelVerdictsSection({
  companyId,
  driverId,
}: {
  companyId: string;
  driverId: string;
}) {
  const q = useQuery({
    queryKey: ["driver-profile", "fuel", companyId, driverId],
    queryFn: () => getDriverProfileFuel(companyId, driverId),
    enabled: Boolean(companyId && driverId),
  });
  const rows = q.isError ? [] : q.data?.fills ?? [];

  const columns = useMemo<ParityColumn<DriverFuelFillRow>[]>(
    () => [
      {
        key: "transaction_at",
        label: "When",
        sortable: true,
        render: (row) => formatDateTimeUS(row.transaction_at),
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => (
          <EntityLinkOrTombstone kind="unit" id={row.unit_id} name={row.unit_number} noun="Unit" />
        ),
      },
      {
        key: "gallons",
        label: "Gal",
        sortable: true,
        render: (row) => (row.gallons == null ? "—" : String(row.gallons)),
      },
      {
        key: "total_cost",
        label: "Amount",
        sortable: true,
        render: (row) => money(row.total_cost),
      },
      {
        key: "verdict",
        label: "E-21 / E-22",
        sortable: false,
        render: (row) => <span className="text-left text-xs text-[#1F2A44]">{verdictLabel(row)}</span>,
      },
      {
        key: "load_number",
        label: "Load",
        sortable: true,
        render: (row) =>
          row.load_id ? (
            <EntityLinkOrTombstone kind="load" id={row.load_id} name={row.load_number} noun="Load" />
          ) : (
            "—"
          ),
      },
    ],
    [],
  );

  return (
    <section className="space-y-2" data-testid="dp-section-fuel-verdicts" data-dp-fuel-verdicts="1">
      <div className="rounded-sm border border-gray-200 bg-white p-3">
        <h2 className="mb-1 text-xs font-semibold text-[#0F1219]">Fuel (driver at fill time)</h2>
        <p className="mb-2 text-xs text-[#4B5563]">
          Fills on units this driver held when the pump ran. Verdicts composed from CC-2 E-21 fraud alerts and
          E-22 GPS matches — read only.
        </p>
        {q.isError ? (
          <ListErrorState title="Couldn't load fuel verdicts" status={0} message={(q.error as Error)?.message} onRetry={() => void q.refetch()} />
        ) : (
          <ParityTable
            storageKey="driver-profile-fuel-verdicts"
            tableTestId="driver-profile-fuel-verdicts-table"
            columns={columns}
            rows={rows}
            rowKey={(row) => row.id}
            emptyText="No fuel fills attributed to this driver in the last 30 days."
            initialPageSize={10}
            pageSizeOptions={[10, 25, 50]}
          />
        )}
      </div>
    </section>
  );
}
