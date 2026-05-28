import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { listDrivers } from "../../../api/mdata";
import {
  createDriverQualificationItem,
  listDriverQualificationItems,
  patchDriverQualificationItem,
  type DriverQualificationFileItem,
} from "../../../api/safety";
import { useCompanyContext } from "../../../contexts/CompanyContext";

function statusClass(status: DriverQualificationFileItem["status"]) {
  if (status === "present") return "bg-emerald-50 text-emerald-800";
  if (status === "expired") return "bg-red-50 text-red-800";
  return "bg-amber-50 text-amber-800";
}

function pillClass(pill?: DriverQualificationFileItem["expiry_pill"]) {
  if (pill === "red") return "bg-red-100 text-red-800";
  if (pill === "amber") return "bg-amber-100 text-amber-800";
  if (pill === "green") return "bg-emerald-100 text-emerald-800";
  return "bg-gray-100 text-gray-700";
}

export function DriverFilesTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [driverId, setDriverId] = useState("");
  const [itemName, setItemName] = useState("");

  const driversQ = useQuery({
    queryKey: ["drivers", "dqf", companyId],
    enabled: Boolean(companyId),
    queryFn: () => listDrivers({ operating_company_id: companyId, status: "active" }).then((r) => r.drivers),
  });

  const selectedDriver = useMemo(
    () => (driversQ.data ?? []).find((driver) => driver.id === driverId) ?? null,
    [driversQ.data, driverId]
  );

  const itemsQ = useQuery({
    queryKey: ["safety", "driver-dqf", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => listDriverQualificationItems(driverId, companyId).then((r) => r.items),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createDriverQualificationItem(companyId, {
        driver_id: driverId,
        item_name: itemName.trim(),
        status: "present",
      }),
    onSuccess: async () => {
      setItemName("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "driver-dqf", companyId, driverId] });
    },
  });

  const patchMutation = useMutation({
    mutationFn: (payload: { id: string; status: DriverQualificationFileItem["status"] }) =>
      patchDriverQualificationItem(payload.id, companyId, { status: payload.status }),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety", "driver-dqf", companyId, driverId] });
    },
  });

  if (!companyId) {
    return <div className="rounded border border-gray-200 bg-white p-4 text-xs text-slate-600">Select an operating company.</div>;
  }

  return (
    <div className="space-y-3 rounded border border-gray-200 bg-white p-4">
      <div className="flex flex-wrap items-end gap-3">
        <label className="block text-xs text-slate-600">
          Driver
          <select
            className="mt-1 block min-w-[240px] rounded border border-gray-300 px-2 py-1 text-sm"
            value={driverId}
            onChange={(event) => setDriverId(event.target.value)}
          >
            <option value="">Select driver…</option>
            {(driversQ.data ?? []).map((driver) => (
              <option key={driver.id} value={driver.id}>
                {[driver.first_name, driver.last_name].filter(Boolean).join(" ") || driver.id}
              </option>
            ))}
          </select>
        </label>
        {selectedDriver ? (
          <div className="text-xs text-slate-500">
            DQF checklist for{" "}
            <span className="font-medium text-slate-800">
              {[selectedDriver.first_name, selectedDriver.last_name].filter(Boolean).join(" ")}
            </span>
          </div>
        ) : null}
      </div>

      {driverId ? (
        <>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              if (!itemName.trim()) return;
              createMutation.mutate();
            }}
          >
            <label className="block text-xs text-slate-600">
              Add checklist item
              <input
                className="mt-1 block min-w-[260px] rounded border border-gray-300 px-2 py-1 text-sm"
                value={itemName}
                onChange={(event) => setItemName(event.target.value)}
                placeholder="e.g. MVR, Med Card, Road Test"
              />
            </label>
            <button
              type="submit"
              className="rounded bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
              disabled={createMutation.isPending || !itemName.trim()}
            >
              Add item
            </button>
          </form>

          <div className="overflow-x-auto rounded border border-gray-200">
            <table className="min-w-full text-left text-xs">
              <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
                <tr>
                  <th className="px-2 py-2">Item</th>
                  <th className="px-2 py-2">Status</th>
                  <th className="px-2 py-2">Effective</th>
                  <th className="px-2 py-2">Expiry</th>
                  <th className="px-2 py-2">Expiry pill</th>
                  <th className="px-2 py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {(itemsQ.data ?? []).map((item) => (
                  <tr key={item.id} className="border-t border-gray-100">
                    <td className="px-2 py-2 font-medium text-slate-800">{item.item_name}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 ${statusClass(item.status)}`}>{item.status}</span>
                    </td>
                    <td className="px-2 py-2 text-slate-600">{item.effective_date ?? "—"}</td>
                    <td className="px-2 py-2 text-slate-600">{item.expiry_date ?? "—"}</td>
                    <td className="px-2 py-2">
                      <span className={`rounded px-1.5 py-0.5 ${pillClass(item.expiry_pill)}`}>{item.expiry_pill ?? "unknown"}</span>
                    </td>
                    <td className="px-2 py-2">
                      <div className="flex gap-1">
                        {(["present", "missing", "expired"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className="rounded border border-gray-300 px-1.5 py-0.5 text-[10px] hover:bg-gray-50 disabled:opacity-50"
                            disabled={patchMutation.isPending || item.status === status}
                            onClick={() => patchMutation.mutate({ id: item.id, status })}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
                {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-2 py-6 text-center text-slate-500">
                      No DQF items yet. Add the first checklist row above.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <div className="rounded border border-dashed border-gray-300 p-4 text-center text-xs text-slate-500">
          Select a driver to manage qualification file checklist items.
        </div>
      )}
    </div>
  );
}
