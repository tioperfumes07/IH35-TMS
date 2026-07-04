import { useRef } from "react";
import { Link } from "react-router-dom";
import { StatusBadge } from "../../components/StatusBadge";
import { BulkSelectableTable } from "../../components/shared/BulkSelectableTable";
import { useToast } from "../../components/Toast";
import { DriverDqfComplianceChip } from "./components/DriverDqfComplianceChip";
import type { summarizeDriverDqf } from "../../lib/driverDqf";

export type DriverTableRow = {
  driverId: string;
  name: string;
  status: string;
  summary: ReturnType<typeof summarizeDriverDqf>;
};

type Props = {
  rows: DriverTableRow[];
  onOpenProfile?: (driverId: string) => void;
};

export function DriversTable({ rows, onOpenProfile }: Props) {
  const { pushToast } = useToast();
  // Mirror the current bulk selection so the "Export Selected" action (whose onClick is fixed at
  // config time and can't see the render-prop ctx) exports exactly the checked rows.
  const selectedRowsRef = useRef<DriverTableRow[]>([]);

  function handleExportSelected() {
    const scope = selectedRowsRef.current.length > 0 ? selectedRowsRef.current : rows;
    if (scope.length === 0) {
      pushToast("No drivers to export.", "info");
      return;
    }
    const esc = (value: unknown) => {
      const s = value == null ? "" : String(value);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = ["Driver", "Status", "DQF level", "Present", "Missing", "Expired", "Driver ID"];
    const lines = scope.map((row) =>
      [row.name, row.status, row.summary.level, row.summary.presentCount, row.summary.missingCount, row.summary.expiredCount, row.driverId]
        .map(esc)
        .join(",")
    );
    const csv = [header.map(esc).join(","), ...lines].join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const href = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = href;
    anchor.download = `IH35-drivers-dqf-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(href);
  }

  return (
    <BulkSelectableTable
      entityType="drivers"
      rows={rows}
      getRowId={(row) => row.driverId}
      bulkActions={[
        {
          id: "export",
          label: "Export Selected (CSV)",
          onClick: handleExportSelected,
        },
        {
          // No bulk tag endpoint exists yet — honestly disabled instead of a fake success toast.
          id: "tag",
          label: "Tag (coming soon)",
          disabled: true,
          onClick: () => pushToast("Bulk tagging is not available yet.", "info"),
        },
        {
          // No bulk deactivate endpoint exists yet — honestly disabled (deactivate one driver from the profile).
          id: "deactivate",
          label: "Deactivate (coming soon)",
          destructive: true,
          action: "deactivate",
          disabled: true,
          onClick: () => pushToast("Bulk deactivate is not available yet — deactivate a driver from their profile.", "info"),
        },
      ]}
    >
      {(ctx) => {
        selectedRowsRef.current = rows.filter((row) => ctx.isSelected(row.driverId));
        return (
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="w-8 px-3 py-2">{ctx.renderHeaderCheckbox()}</th>
              <th className="px-3 py-2">Driver</th>
              <th className="px-3 py-2">Status</th>
              <th className="px-3 py-2">DQF status chips</th>
              <th className="px-3 py-2">Checklist stats</th>
              <th className="px-3 py-2 text-right">Profile</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.driverId} className="border-t border-gray-100">
                <td className="px-3 py-2">{ctx.renderRowCheckbox(row.driverId)}</td>
                <td className="px-3 py-2 font-medium text-slate-900">
                  {/* D1: the driver name itself opens the profile (entity-name click → its profile),
                      not only the trailing "Open profile" action. Same target as that action. */}
                  {onOpenProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenProfile(row.driverId)}
                      className="text-left font-medium text-slate-900 hover:text-slate-700 hover:underline"
                    >
                      {row.name}
                    </button>
                  ) : (
                    <Link to={`/drivers/${row.driverId}/profile`} className="font-medium text-slate-900 hover:text-slate-700 hover:underline">
                      {row.name}
                    </Link>
                  )}
                </td>
                <td className="px-3 py-2">
                  <StatusBadge status={row.status} />
                </td>
                <td className="px-3 py-2">
                  <DriverDqfComplianceChip summary={row.summary} compact />
                </td>
                <td className="px-3 py-2 text-slate-600">
                  {row.summary.presentCount} present · {row.summary.missingCount} missing · {row.summary.expiredCount}{" "}
                  expired
                </td>
                <td className="px-3 py-2 text-right">
                  {onOpenProfile ? (
                    <button
                      type="button"
                      onClick={() => onOpenProfile(row.driverId)}
                      className="text-xs font-semibold text-slate-700 hover:underline"
                    >
                      Open profile
                    </button>
                  ) : (
                    <Link to={`/drivers/${row.driverId}/profile`} className="text-xs font-semibold text-slate-700 hover:underline">
                      Open profile
                    </Link>
                  )}
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-3 py-6 text-center text-slate-500">
                  No drivers found.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
        );
      }}
    </BulkSelectableTable>
  );
}
