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

  return (
    <BulkSelectableTable
      entityType="drivers"
      rows={rows}
      getRowId={(row) => row.driverId}
      bulkActions={[
        {
          id: "export",
          label: "Export Selected",
          onClick: () => pushToast(`Export queued for ${rows.length} drivers.`, "success"),
        },
        {
          id: "tag",
          label: "Tag",
          onClick: () => pushToast("Tag drivers — wire bulk endpoint in follow-up.", "success"),
        },
        {
          id: "deactivate",
          label: "Deactivate",
          destructive: true,
          action: "deactivate",
          onClick: () => pushToast("Deactivate — wire bulk endpoint in follow-up.", "success"),
        },
      ]}
    >
      {(ctx) => (
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
                <td className="px-3 py-2 font-medium text-slate-900">{row.name}</td>
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
                      className="text-xs font-semibold text-sky-700 hover:underline"
                    >
                      Open profile
                    </button>
                  ) : (
                    <Link to={`/drivers/${row.driverId}/profile`} className="text-xs font-semibold text-sky-700 hover:underline">
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
      )}
    </BulkSelectableTable>
  );
}
