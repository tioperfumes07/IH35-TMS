import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createDriverQualificationItem,
  listDriverQualificationItems,
  patchDriverQualificationItem,
  type DriverQualificationFileItem,
} from "../../../api/safety";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable } from "../../../components/parity/ParityTable";
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
      <div className="rounded-sm border border-dashed border-gray-300 p-4 text-center text-xs text-slate-500">
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
              className="mt-1 block min-w-[260px] rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              placeholder="e.g. MVR, Med Card, Road Test"
            />
          </label>
          <button
            type="submit"
            className="rounded-sm bg-slate-800 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
            disabled={createMutation.isPending || !itemName.trim()}
          >
            + Create checklist item
          </button>
        </form>
      ) : null}

      {itemsQ.isError ? (
        <ListErrorState
          title="Couldn't load DQF checklist"
          status={0}
          message={(itemsQ.error as Error)?.message}
          onRetry={() => void itemsQ.refetch()}
        />
      ) : (
        <ParityTable<DriverQualificationFileItem>
          rows={itemsQ.data ?? []}
          rowKey={(item) => item.id}
          loading={itemsQ.isLoading}
          storageKey="driver-dqf-checklist"
          tableTestId="driver-dqf-checklist-table"
          emptyText={editable ? "No DQF items yet. Create the first checklist row above." : "No DQF items yet."}
          columns={[
            {
              key: "item_name",
              label: "Item",
              sortable: true,
              cellClass: "font-medium text-slate-800",
            },
            {
              key: "status",
              label: "Status",
              sortable: true,
              render: (item) => (
                <span className={`rounded-sm px-1.5 py-0.5 ${dqfItemStatusClass(item.status)}`}>{item.status}</span>
              ),
            },
            {
              key: "effective_date",
              label: "Effective",
              sortable: true,
              cellClass: "text-slate-600",
              render: (item) => item.effective_date ?? "—",
            },
            {
              key: "expiry_date",
              label: "Expiry",
              sortable: true,
              cellClass: "text-slate-600",
              render: (item) => item.expiry_date ?? "—",
            },
            {
              key: "expiry_pill",
              label: "Expiry pill",
              sortable: true,
              render: (item) => (
                <span className={`rounded-sm px-1.5 py-0.5 ${dqfExpiryPillClass(item.expiry_pill)}`}>
                  {item.expiry_pill ?? "unknown"}
                </span>
              ),
            },
            ...(editable
              ? [
                  {
                    key: "actions",
                    label: "Actions",
                    render: (item: DriverQualificationFileItem) => (
                      <div className="flex gap-1">
                        {(["present", "missing", "expired"] as const).map((status) => (
                          <button
                            key={status}
                            type="button"
                            className="rounded-sm border border-gray-300 px-1.5 py-0.5 text-[10px] hover:bg-gray-50 disabled:opacity-50"
                            disabled={patchMutation.isPending || item.status === status}
                            onClick={() => patchMutation.mutate({ id: item.id, status })}
                          >
                            {status}
                          </button>
                        ))}
                      </div>
                    ),
                  },
                ]
              : []),
          ]}
        />
      )}
    </div>
  );
}
