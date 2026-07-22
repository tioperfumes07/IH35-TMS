import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDispatchAvailableDrivers, type AvailableDriverRow } from "../../api/dispatch";
import { Combobox } from "../../components/Combobox";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";

export type AssignDriverDropdownProps = {
  loadId: string;
  operatingCompanyId: string;
  value: string;
  onChange: (driverId: string) => void;
  forPickupAt?: string;
  disabled?: boolean;
  /** When set (e.g. in tests), skips network fetch. */
  driversOverride?: AvailableDriverRow[];
  /**
   * Parent already a ParityDrawer → pass "drawer". Standalone Modal/page → default "modal".
   * LoadReassignModal uses Modal, so consumers inherit shell="modal" unless overridden.
   */
  shell?: "modal" | "drawer";
};

export const REASSIGN_REASON_CODES = [
  { value: "driver_request", label: "Driver request" },
  { value: "breakdown", label: "Breakdown / equipment" },
  { value: "hos_reset", label: "HOS / reset" },
  { value: "customer_change", label: "Customer / shipper change" },
  { value: "other", label: "Other" },
] as const;

export function AssignDriverDropdown({
  loadId,
  operatingCompanyId,
  value,
  onChange,
  forPickupAt,
  disabled,
  driversOverride,
  shell = "modal",
}: AssignDriverDropdownProps) {
  const q = useQuery({
    queryKey: ["dispatch", "available-drivers", loadId, operatingCompanyId, forPickupAt ?? ""],
    queryFn: () =>
      getDispatchAvailableDrivers({
        operating_company_id: operatingCompanyId,
        load_id: loadId,
        for_pickup_at: forPickupAt,
      }),
    enabled: Boolean(loadId && operatingCompanyId && driversOverride == null),
  });

  const drivers = driversOverride ?? q.data?.drivers ?? [];
  const sorted = useMemo(() => {
    const copy = [...drivers];
    copy.sort((a, b) => {
      if (a.hos_safe !== b.hos_safe) return a.hos_safe ? -1 : 1;
      return a.distance_to_pickup_miles - b.distance_to_pickup_miles;
    });
    return copy;
  }, [drivers]);

  const [pendingUnsafe, setPendingUnsafe] = useState<AvailableDriverRow | null>(null);
  const [driverCreateOpen, setDriverCreateOpen] = useState(false);
  /** Newly created driver may not yet appear in available-drivers (HOS/distance); keep a local option. */
  const [createdOption, setCreatedOption] = useState<{ driver_id: string; display_name: string } | null>(null);

  const optionsRows = useMemo(() => {
    if (!createdOption) return sorted;
    if (sorted.some((d) => d.driver_id === createdOption.driver_id)) return sorted;
    return [
      {
        driver_id: createdOption.driver_id,
        display_name: createdOption.display_name,
        display_id: null,
        hours_remaining_today: 0,
        hours_remaining_week: 0,
        distance_to_pickup_miles: 0,
        hos_safe: true,
        is_in_violation: false,
      } satisfies AvailableDriverRow,
      ...sorted,
    ];
  }, [sorted, createdOption]);

  const comboboxOptions = useMemo(
    () =>
      optionsRows.map((d) => ({
        value: d.driver_id,
        label: d.hos_safe ? d.display_name : `${d.display_name} — out of HOS`,
      })),
    [optionsRows]
  );

  const onSelectId = (id: string) => {
    const row = optionsRows.find((d) => d.driver_id === id);
    if (!row) {
      onChange(id);
      return;
    }
    if (!row.hos_safe) {
      setPendingUnsafe(row);
      return;
    }
    onChange(id);
  };

  return (
    <div className="space-y-1">
      <label className="text-xs font-semibold text-gray-600">Driver</label>
      <Combobox
        className="h-9 w-full text-sm"
        options={comboboxOptions}
        value={value || null}
        disabled={disabled || (!driversOverride && q.isLoading)}
        loading={!driversOverride && q.isLoading}
        placeholder={q.isLoading ? "Loading…" : "Select driver"}
        allowClear
        allowAddNew={{
          label: "+ Create driver",
          onAdd: () => setDriverCreateOpen(true),
        }}
        onChange={(next) => {
          if (!next) {
            onChange("");
            return;
          }
          onSelectId(next);
        }}
      />
      {pendingUnsafe ? (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-2 text-xs text-slate-700">
          <p className="font-semibold">Driver is out of hours today</p>
          <p className="mt-1">{pendingUnsafe.display_name} may not have enough on-duty time for this pickup.</p>
          <div className="mt-2 flex gap-2">
            <button
              type="button"
              className="rounded-sm bg-slate-600 px-2 py-1 text-white"
              onClick={() => {
                onChange(pendingUnsafe.driver_id);
                setPendingUnsafe(null);
              }}
            >
              Assign anyway
            </button>
            <button type="button" className="rounded-sm border border-slate-200 px-2 py-1" onClick={() => setPendingUnsafe(null)}>
              Cancel
            </button>
          </div>
        </div>
      ) : null}
      <CreateDriverModal
        open={driverCreateOpen}
        companyId={operatingCompanyId}
        shell={shell}
        onClose={() => setDriverCreateOpen(false)}
        onCreated={(createdId) => {
          setCreatedOption({ driver_id: createdId, display_name: `Driver ${createdId.slice(0, 8)}` });
          onChange(createdId);
          setDriverCreateOpen(false);
          void q.refetch();
        }}
      />
    </div>
  );
}
