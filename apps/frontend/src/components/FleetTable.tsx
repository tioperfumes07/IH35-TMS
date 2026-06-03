import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "../api/client";
import { useToast } from "./Toast";
import { BulkActionBar, type BulkApplyPayload } from "./fleet/BulkActionBar";

export type FleetRow = {
  id: string;
  status?: string;
  unit_number?: string;
  vin?: string;
  make?: string;
  model?: string;
  year?: string | number;
  is_oos?: boolean;
  vehicle_type?: string | null;
};

type Props = {
  operatingCompanyId: string;
  rows: FleetRow[];
};

function deriveVehicleType(row: FleetRow): string {
  if (row.vehicle_type?.trim()) return row.vehicle_type.trim();
  const makeModel = [row.make, row.model].filter(Boolean).join(" ").trim();
  return makeModel || "Unknown";
}

export function FleetTable({ operatingCompanyId, rows }: Props) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [selected, setSelected] = useState<Set<string>>(() => new Set());

  const visibleIds = useMemo(() => rows.map((row) => row.id), [rows]);
  const allVisibleSelected = visibleIds.length > 0 && visibleIds.every((id) => selected.has(id));
  const vehicleTypes = useMemo(() => Array.from(new Set(rows.map(deriveVehicleType))), [rows]);

  const bulkMutation = useMutation({
    mutationFn: (args: { unitIds: string[]; patch: BulkApplyPayload }) =>
      apiRequest<{ affected_count: number }>(
        `/api/v1/mdata/units/bulk-update?operating_company_id=${encodeURIComponent(operatingCompanyId)}`,
        {
          method: "POST",
          body: {
            unit_ids: args.unitIds,
            patch: args.patch,
          },
        }
      ),
    onSuccess: (data) => {
      pushToast(`${data.affected_count} units updated`, "success");
      setSelected(new Set());
      void queryClient.invalidateQueries({ queryKey: ["maintenance", "fleet-table"] });
    },
    onError: (error: Error) => {
      pushToast(error.message || "Bulk update failed", "error");
    },
  });

  const toggleRow = (unitId: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(unitId)) next.delete(unitId);
      else next.add(unitId);
      return next;
    });
  };

  const toggleAllVisible = () => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (allVisibleSelected) {
        for (const id of visibleIds) next.delete(id);
      } else {
        for (const id of visibleIds) next.add(id);
      }
      return next;
    });
  };

  return (
    <div className="space-y-2">
      <BulkActionBar
        selectedCount={selected.size}
        vehicleTypes={vehicleTypes}
        applying={bulkMutation.isPending}
        onClear={() => setSelected(new Set())}
        onApply={(patch) =>
          bulkMutation.mutate({
            unitIds: Array.from(selected),
            patch,
          })
        }
      />

      <div className="overflow-hidden rounded border border-gray-200 bg-white">
        <table className="w-full table-fixed text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase text-gray-600">
            <tr>
              <th className="w-8 px-2 py-1">
                <input
                  type="checkbox"
                  aria-label="Select all units on this page"
                  checked={allVisibleSelected}
                  onChange={toggleAllVisible}
                />
              </th>
              <th className="px-2 py-1">Unit</th>
              <th className="px-2 py-1">VIN</th>
              <th className="px-2 py-1">Make/Model</th>
              <th className="px-2 py-1">Year</th>
              <th className="px-2 py-1">Status</th>
              <th className="px-2 py-1">DOT O/O</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <tr
                key={row.id}
                className="cursor-pointer border-t border-gray-100 hover:bg-gray-50"
                onClick={() => navigate(`/fleet/units/${row.id}`)}
              >
                <td className="px-2 py-1" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="checkbox"
                    aria-label={`Select unit ${row.unit_number ?? row.id}`}
                    checked={selected.has(row.id)}
                    onChange={() => toggleRow(row.id)}
                  />
                </td>
                <td className="px-2 py-1">{String(row.unit_number ?? row.id ?? "—")}</td>
                <td className="truncate px-2 py-1">{String(row.vin ?? "—")}</td>
                <td className="truncate px-2 py-1">{`${String(row.make ?? "—")} ${String(row.model ?? "")}`.trim()}</td>
                <td className="px-2 py-1">{String(row.year ?? "—")}</td>
                <td className="px-2 py-1">{String(row.status ?? "—")}</td>
                <td className="px-2 py-1">{row.is_oos ? "Yes" : "No"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
