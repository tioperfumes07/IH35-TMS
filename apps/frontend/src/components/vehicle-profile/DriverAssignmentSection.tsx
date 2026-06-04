import { apiRequest } from "../../api/client";
import { Button } from "../Button";
import { useMutation, useQueryClient } from "@tanstack/react-query";

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
  const mismatch =
    defaultDriver?.id &&
    currentDriver?.id &&
    String(defaultDriver.id) !== String(currentDriver.id);

  const clearDefault = useMutation({
    mutationFn: () =>
      apiRequest(`/api/v1/mdata/units/${unitId}/drivers/clear-default?operating_company_id=${encodeURIComponent(companyId)}`, {
        method: "POST",
      }),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ["unit-profile", unitId, companyId] }),
  });

  return (
    <section className="rounded border border-gray-200 bg-white p-4">
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
        <div className="rounded border border-gray-100 p-3">
          <div className="text-xs font-semibold text-gray-500">Default driver</div>
          <div className="text-sm font-medium">{String(defaultDriver?.name ?? "Not set")}</div>
          <div className="text-xs text-gray-600">{String(defaultDriver?.phone ?? "")}</div>
          <Button size="sm" variant="secondary" className="mt-2" onClick={() => clearDefault.mutate()}>
            Clear default
          </Button>
        </div>
        <div className="rounded border border-gray-100 p-3">
          <div className="text-xs font-semibold text-gray-500">Currently driving</div>
          <div className="text-sm font-medium">{String(currentDriver?.name ?? "—")}</div>
          <div className="text-xs text-gray-600">
            {currentDriver?.logged_in_at ? `Logged in ${String(currentDriver.logged_in_at)}` : ""}
            {currentDriver?.source ? ` via ${String(currentDriver.source)}` : ""}
          </div>
          <div className="mt-2 text-xs text-gray-600">
            HOS: Drive {String(currentDriver?.hos_drive_remaining_min ?? "—")}m · On-duty{" "}
            {String(currentDriver?.hos_on_duty_remaining_min ?? "—")}m · Cycle {String(currentDriver?.hos_cycle_remaining_min ?? "—")}m
          </div>
        </div>
      </div>
    </section>
  );
}
