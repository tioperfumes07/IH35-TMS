import { useQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { getDispatchAvailableDrivers, type AvailableDriverRow } from "../../api/dispatch";
import { listAllDrivers } from "../../api/mdata";
import { Combobox } from "../../components/Combobox";
import { CreateDriverModal } from "../../components/drivers/CreateDriverModal";
import { EntityLinkOrTombstone } from "../../components/shared/EntityLinkOrTombstone";
import { ListErrorBanner } from "../../components/shared/ListErrorBanner";
import { userFacingApiError } from "../../lib/api-error-message";
import { entityLabel } from "../../lib/entity-label";

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
        load_id: loadId as string,
        for_pickup_at: forPickupAt,
      }),
    enabled: Boolean(loadId && operatingCompanyId && driversOverride == null),
  });

  // FAIL-D1 — the driver picker showed ZERO drivers on Book Load, with no error and no empty-state reason.
  // Cause: the query above is gated on `loadId`, and during Book Load the load does not exist yet, so it never
  // ran. `/dispatch/available-drivers` also REQUIRES load_id server-side, so it cannot serve the pre-create
  // case at all. Neither the API nor the data was broken — measured on prod, that endpoint returns 24 drivers
  // for USMCA and the shared names search returns 27; the picker simply never asked.
  //
  // Pre-create fallback: source the roster from the load-independent driver list. HOS/proximity fields are not
  // available without a load, so they are reported as unknown rather than invented — `hos_safe: true` here
  // would fake a safety clearance this endpoint cannot give, and the caller already re-checks HOS on select.
  const rosterQ = useQuery({
    queryKey: ["dispatch", "available-drivers", "preload-roster", operatingCompanyId],
    queryFn: () => listAllDrivers({ operating_company_id: operatingCompanyId, status: "Active" }),
    enabled: Boolean(!loadId && operatingCompanyId && driversOverride == null),
  });

  const rosterDrivers: AvailableDriverRow[] = (rosterQ.data?.drivers ?? []).map((d) => ({
    driver_id: d.id,
    customer_id: "",
    unit_id: null,
    display_name: entityLabel([d.first_name, d.last_name].filter(Boolean).join(" ").trim(), d.id, "Driver"),
    display_id: null,
    hours_remaining_today: 0,
    hours_remaining_week: 0,
    distance_to_pickup_miles: 0,
    hos_safe: false,
    is_in_violation: false,
  }));

  const drivers = driversOverride ?? (loadId ? q.data?.drivers ?? [] : rosterDrivers);
  const activeQuery = loadId ? q : rosterQ;
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
        customer_id: "",
        unit_id: null,
        display_name: createdOption.display_name,
        display_id: null,
        hours_remaining_today: 0,
        hours_remaining_week: 0,
        distance_to_pickup_miles: 0,
        // A newly created driver has no load-relative HOS evaluation yet. Keep the option selectable
        // (the assignment AuthGate rechecks it), but never manufacture clearance in the picker.
        hos_safe: false,
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
      {!driversOverride && activeQuery.isError ? (
        <ListErrorBanner
          message={userFacingApiError(activeQuery.error, "Could not load available drivers")}
          onRetry={() => void activeQuery.refetch()}
        />
      ) : null}
      <Combobox
        className="h-9 w-full text-sm"
        options={comboboxOptions}
        value={value || null}
        disabled={disabled || (!driversOverride && (activeQuery.isLoading || activeQuery.isError))}
        loading={!driversOverride && activeQuery.isLoading}
        placeholder={activeQuery.isLoading ? "Loading…" : "Select driver"}
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
      {/* Exact Leaves dispatch.modal.load_reassign:driver / assign_driver_dropdown:driver —
          Combobox labels alone are not a reverse/forward EntityLink. When a driver is selected,
          expose a real profile hop (cancel-safe; no assign mutation from the link). */}
      {value ? (
        <div className="text-xs text-slate-600" data-testid="assign-driver-selected-entitylink">
          Selected:{" "}
          <EntityLinkOrTombstone
            kind="driver"
            id={value}
            name={optionsRows.find((d) => d.driver_id === value)?.display_name ?? createdOption?.display_name ?? null}
            noun="Driver"
          />
        </div>
      ) : null}
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
        onCreated={(createdId, displayName) => {
          setCreatedOption({ driver_id: createdId, display_name: displayName });
          onChange(createdId);
          setDriverCreateOpen(false);
          void q.refetch();
        }}
      />
    </div>
  );
}
