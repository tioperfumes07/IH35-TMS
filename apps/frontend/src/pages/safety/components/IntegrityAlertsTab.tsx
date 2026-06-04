/**
 * ARCHIVE (Sunset 2026-09-01): Phase 3 aggregate preview — replaced by IntegrityAlertsPage (A23-12).
 * Kept for reference; route wiring uses IntegrityAlertsPage via manifest IntegrityAlertsTab wrapper.
 */
type Props = {
  unitRows: Array<Record<string, unknown>>;
  driverRows: Array<Record<string, unknown>>;
  vendorRows: Array<Record<string, unknown>>;
  baselineRows: Array<Record<string, unknown>>;
};

function RowTable({
  title,
  columns,
  rows,
}: {
  title: string;
  columns: Array<{ key: string; label: string }>;
  rows: Array<Record<string, unknown>>;
}) {
  return (
    <section className="rounded border border-gray-200 bg-white p-2">
      <h3 className="mb-2 text-xs font-semibold uppercase text-gray-700">{title}</h3>
      <div className="overflow-x-auto">
        <table className="min-w-full text-xs">
          <thead>
            <tr className="text-left text-gray-500">
              {columns.map((column) => (
                <th key={column.key} className="px-2 py-1 font-semibold">
                  {column.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.slice(0, 20).map((row, index) => (
              <tr key={String(row.id ?? row.unit_id ?? row.driver_id ?? row.vendor_id ?? index)} className="border-t border-gray-100">
                {columns.map((column) => (
                  <td key={column.key} className="px-2 py-1">
                    {String(row[column.key] ?? "—")}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function IntegrityAlertsTab({ unitRows, driverRows, vendorRows, baselineRows }: Props) {
  return (
    <div className="space-y-2">
      <div className="rounded border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-900">
        Phase 6 will add real-time alert generation. This Phase 3 view shows the raw aggregate data the alert engine will use.
      </div>
      <div className="grid grid-cols-1 gap-2 xl:grid-cols-2">
        <RowTable
          title="By Unit"
          rows={unitRows}
          columns={[
            { key: "unit_display_id", label: "Unit" },
            { key: "tire_changes_60d", label: "Tire 60d" },
            { key: "repairs_30d", label: "Repairs 30d" },
            { key: "cost_90d", label: "Cost 90d" },
          ]}
        />
        <RowTable
          title="By Driver"
          rows={driverRows}
          columns={[
            { key: "full_name", label: "Driver" },
            { key: "wo_count_90d", label: "WOs 90d" },
            { key: "accidents_90d", label: "Accidents 90d" },
            { key: "tire_changes_90d", label: "Tire 90d" },
          ]}
        />
        <RowTable
          title="By Vendor"
          rows={vendorRows}
          columns={[
            { key: "display_name", label: "Vendor" },
            { key: "wo_count_90d", label: "WOs 90d" },
            { key: "spend_90d", label: "Spend 90d" },
            { key: "avg_part_cost_90d", label: "Avg part cost 90d" },
          ]}
        />
        <RowTable
          title="Fleet Baselines"
          rows={baselineRows}
          columns={[
            { key: "equipment_class", label: "Equipment Class" },
            { key: "avg_tire_changes_60d", label: "Avg tire 60d" },
            { key: "avg_repairs_30d", label: "Avg repairs 30d" },
            { key: "p95_cost_90d", label: "P95 cost 90d" },
          ]}
        />
      </div>
    </div>
  );
}
