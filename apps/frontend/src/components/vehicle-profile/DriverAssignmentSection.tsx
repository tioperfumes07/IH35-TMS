import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

const DRIVER_LINK = "text-slate-700 hover:underline";

export function DriverAssignmentSection({
  unitId,
  companyId,
  defaultDriver,
  currentDriver,
  onQuickAssign,
}: {
  unitId: string;
  companyId: string;
  defaultDriver: Record<string, unknown> | null;
  currentDriver: Record<string, unknown> | null;
  onQuickAssign?: () => void;
}) {
  const qc = useQueryClient();
  const actionGenerationRef = useRef(0);
  const [clearError, setClearError] = useState<unknown>(null);
  const mismatch =
    defaultDriver?.id &&
    currentDriver?.id &&
    String(defaultDriver.id) !== String(currentDriver.id);

  const clearDefault = useMutation({
    mutationFn: (input: { unitId: string; companyId: string; driverId: string; generation: number }) =>
      apiRequest(`/api/v1/mdata/units/${input.unitId}/drivers/clear-default?operating_company_id=${encodeURIComponent(input.companyId)}`, {
        method: "POST",
        body: { expected_driver_id: input.driverId },
      }),
    onMutate: () => setClearError(null),
    onSuccess: (_result, input) => void qc.invalidateQueries({ queryKey: ["unit-profile", input.unitId, input.companyId] }),
    onError: (error, input) => {
      if (input.generation === actionGenerationRef.current) setClearError(error);
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    setClearError(null);
    clearDefault.reset();
  }, [companyId, unitId, defaultDriver?.id]);

  return (
    <section className="rounded-sm border border-gray-200 bg-white p-4">
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-gray-800">Driver assignment</h3>
        {onQuickAssign ? (
          <Button size="sm" onClick={onQuickAssign} data-testid="quick-assign-truck">
            Quick assign
          </Button>
        ) : null}
      </div>
      {mismatch ? <p className="mt-1 text-xs text-amber-700">Default driver differs from currently driving (Samsara).</p> : null}
      <div className="mt-3 grid gap-3 md:grid-cols-2">
        <div className="rounded-sm border border-gray-100 p-3">
          <div className="text-xs font-semibold text-gray-500">Default driver</div>
          <div className="text-sm font-medium">
            {defaultDriver?.id ? (
              <EntityLinkOrTombstone kind="driver" id={String(defaultDriver.id)} name={defaultDriver.name} noun="Driver" className={DRIVER_LINK}
                data-testid="vehicle-profile-default-driver-link" />
            ) : (
              String(defaultDriver?.name ?? "Not set")
            )}
          </div>
          <div className="text-xs text-gray-600">{String(defaultDriver?.phone ?? "")}</div>
          <Button
            size="sm"
            variant="secondary"
            className="mt-2"
            disabled={!defaultDriver?.id || clearDefault.isPending}
            loading={clearDefault.isPending}
            onClick={() =>
              clearDefault.mutate({
                unitId,
                companyId,
                driverId: String(defaultDriver?.id ?? ""),
                generation: actionGenerationRef.current,
              })
            }
          >
            Clear default
          </Button>
          {clearError ? (
            <p className="mt-2 text-xs text-red-700" role="alert">
              Couldn&apos;t clear default driver. {(clearError as Error)?.message ?? "Try again."}
            </p>
          ) : null}
        </div>
        <div className="rounded-sm border border-gray-100 p-3">
          <div className="text-xs font-semibold text-gray-500">Currently driving</div>
          <div className="text-sm font-medium">
            {currentDriver?.id ? (
              <EntityLinkOrTombstone kind="driver" id={String(currentDriver.id)} name={currentDriver.name} noun="Driver" className={DRIVER_LINK}
                data-testid="vehicle-profile-current-driver-link" />
            ) : (
              String(currentDriver?.name ?? "—")
            )}
          </div>
          <div className="text-xs text-gray-600">
            {currentDriver?.logged_in_at ? `Logged in ${String(currentDriver.logged_in_at)}` : ""}
            {currentDriver?.source ? ` via ${String(currentDriver.source)}` : ""}
          </div>
          {/* HOS-FANOUT (Jorge 2026-07-05) — certified Samsara ELD, verbatim, wired into Fleet/
              Maintenance so "is this truck's driver clear to be on the road right now?" is answerable
              from the vehicle profile too, not just the dispatch board. */}
          <div className="mt-2 text-xs text-gray-600">
            {currentDriver?.hos_drive_remaining_min != null ||
            currentDriver?.hos_on_duty_remaining_min != null ||
            currentDriver?.hos_cycle_remaining_min != null ? (
              <>
                <span
                  className={`mr-1 rounded-sm px-1 text-[9px] font-semibold uppercase tracking-[0.3px] ${
                    currentDriver?.hos_violation
                      ? "bg-red-100 text-red-700"
                      : "bg-emerald-100 text-emerald-700"
                  }`}
                >
                  {currentDriver?.hos_violation ? "HOS violation — certified ELD" : "Certified ELD"}
                </span>
                Drive {String(currentDriver?.hos_drive_remaining_min ?? "—")}m · On-duty{" "}
                {String(currentDriver?.hos_on_duty_remaining_min ?? "—")}m · Cycle{" "}
                {String(currentDriver?.hos_cycle_remaining_min ?? "—")}m
              </>
            ) : (
              "No certified ELD data yet"
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
