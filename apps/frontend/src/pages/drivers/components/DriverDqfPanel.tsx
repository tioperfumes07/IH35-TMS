import { useEffect, useRef, useState } from "react";
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
import { formatDateUS } from "../../../lib/formatDate";

type Props = {
  companyId: string;
  driverId: string;
  editable?: boolean;
  focus?: "all" | "present" | "missing" | "expired" | "expiry_alerts";
  onClearFocus?: () => void;
};

export function DriverDqfPanel({ companyId, driverId, editable = true, focus = "all", onClearFocus }: Props) {
  const queryClient = useQueryClient();
  const [itemName, setItemName] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const scopeGenerationRef = useRef(0);

  useEffect(() => {
    scopeGenerationRef.current += 1;
    setItemName("");
    setMutationError(null);
  }, [companyId, driverId]);

  const itemsQ = useQuery({
    queryKey: ["safety", "driver-dqf", companyId, driverId],
    enabled: Boolean(companyId && driverId),
    queryFn: () => listDriverQualificationItems(driverId, companyId).then((result) => result.items),
  });

  const createMutation = useMutation({
    mutationFn: (input: { companyId: string; driverId: string; itemName: string; generation: number }) =>
      createDriverQualificationItem(input.companyId, {
        driver_id: input.driverId,
        item_name: input.itemName,
        status: "present",
      }),
    onMutate: () => setMutationError(null),
    onSuccess: async (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setItemName("");
      await queryClient.invalidateQueries({ queryKey: ["safety", "driver-dqf", input.companyId, input.driverId] });
    },
    onError: (error, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setMutationError(error instanceof Error ? error.message : "Failed to create DQF item");
    },
  });

  const patchMutation = useMutation({
    mutationFn: (input: { id: string; status: DriverQualificationFileItem["status"]; companyId: string; driverId: string; generation: number }) =>
      patchDriverQualificationItem(input.id, input.companyId, { status: input.status }),
    onMutate: () => setMutationError(null),
    onSuccess: async (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      await queryClient.invalidateQueries({ queryKey: ["safety", "driver-dqf", input.companyId, input.driverId] });
    },
    onError: (error, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      setMutationError(error instanceof Error ? error.message : "Failed to update DQF item");
    },
  });

  const visibleItems = (itemsQ.data ?? []).filter((item) => {
    if (focus === "all") return true;
    if (focus === "expiry_alerts") return item.expiry_pill === "red" || item.expiry_pill === "amber";
    return item.status === focus;
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
      {focus !== "all" ? (
        <div className="flex items-center justify-between rounded-sm border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
          <span>Showing DQF items: {focus === "expiry_alerts" ? "expiry alerts" : focus}</span>
          <button type="button" className="font-medium text-slate-900 underline" onClick={onClearFocus}>
            Show all
          </button>
        </div>
      ) : null}
      {editable ? (
        <form
          className="flex flex-wrap items-end gap-2"
          onSubmit={(event) => {
            event.preventDefault();
            if (!itemName.trim()) return;
            createMutation.mutate({
              companyId,
              driverId,
              itemName: itemName.trim(),
              generation: scopeGenerationRef.current,
            });
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

      {mutationError ? (
        <div role="alert" className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {mutationError}
        </div>
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
          rows={visibleItems}
          rowKey={(item) => item.id}
          loading={itemsQ.isLoading}
          storageKey="driver-dqf-checklist"
          tableTestId="driver-dqf-checklist-table"
          emptyText={focus === "all" ? (editable ? "No DQF items yet. Create the first checklist row above." : "No DQF items yet.") : `No ${focus === "expiry_alerts" ? "expiry alert" : focus} DQF items.`}
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
              render: (item) => formatDateUS(item.effective_date) || "—",
            },
            {
              key: "expiry_date",
              label: "Expiry",
              sortable: true,
              cellClass: "text-slate-600",
              render: (item) => formatDateUS(item.expiry_date) || "—",
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
                            onClick={() =>
                              patchMutation.mutate({
                                id: item.id,
                                status,
                                companyId,
                                driverId,
                                generation: scopeGenerationRef.current,
                              })
                            }
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
