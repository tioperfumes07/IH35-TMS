import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDriverQualificationItem,
  listDriverQualificationItems,
  patchDriverQualificationItem,
  type DriverQualificationFileItem,
} from "../../../api/safety";
import { dqfExpiryPillClass, dqfItemStatusClass } from "../../../lib/driverDqf";

type Props = {
  companyId: string;
  driverId: string;
  editable?: boolean;
};

export function DriverDqfPanel({ companyId, driverId, editable = true }: Props) {
  const queryClient = useQueryClient();
  const [itemName, setItemName] = useState("");

  const itemsQ = useQuery({
    queryKey: ["safety", "driver-dqf", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => listDriverQualificationItems(driverId, companyId).then((result) => result.items),
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

  if (!driverId) {
    return (
      <div className="rounded border border-dashed border-gray-300 p-4 text-center text-xs text-slate-500">
        Select a driver to view the DQF checklist.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {editable ? (
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
      ) : null}

      <div className="overflow-x-auto rounded border border-gray-200">
        <table className="min-w-full text-left text-xs">
          <thead className="bg-gray-50 text-[10px] uppercase tracking-wide text-gray-500">
            <tr>
              <th className="px-2 py-2">Item</th>
              <th className="px-2 py-2">Status</th>
              <th className="px-2 py-2">Effective</th>
              <th className="px-2 py-2">Expiry</th>
              <th className="px-2 py-2">Expiry pill</th>
              {editable ? <th className="px-2 py-2">Actions</th> : null}
            </tr>
          </thead>
          <tbody>
            {(itemsQ.data ?? []).map((item) => (
              <tr key={item.id} className="border-t border-gray-100">
                <td className="px-2 py-2 font-medium text-slate-800">{item.item_name}</td>
                <td className="px-2 py-2">
                  <span className={`rounded px-1.5 py-0.5 ${dqfItemStatusClass(item.status)}`}>{item.status}</span>
                </td>
                <td className="px-2 py-2 text-slate-600">{item.effective_date ?? "—"}</td>
                <td className="px-2 py-2 text-slate-600">{item.expiry_date ?? "—"}</td>
                <td className="px-2 py-2">
                  <span className={`rounded px-1.5 py-0.5 ${dqfExpiryPillClass(item.expiry_pill)}`}>
                    {item.expiry_pill ?? "unknown"}
                  </span>
                </td>
                {editable ? (
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
                ) : null}
              </tr>
            ))}
            {!itemsQ.isLoading && (itemsQ.data ?? []).length === 0 ? (
              <tr>
                <td colSpan={editable ? 6 : 5} className="px-2 py-6 text-center text-slate-500">
                  No DQF items yet. {editable ? "Add the first checklist row above." : ""}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  );
}
