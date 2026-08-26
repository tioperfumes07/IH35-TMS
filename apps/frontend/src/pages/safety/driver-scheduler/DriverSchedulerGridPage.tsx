import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { driverSchedulerOfficeApi, type TempAssignment } from "../../../api/driver-scheduler";
import { PageHeader } from "../../../components/layout/PageHeader";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { companyToday } from "../../../lib/businessDate";
import { ListErrorState } from "../../../components/ListErrorState";
import { formatQueryErrorDetail } from "../../../lib/tableError";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { DatePicker } from "../../../components/forms/DatePicker";
import { formatDateUS } from "../../../lib/formatDate";
import { useToast } from "../../../components/Toast";
import { userFacingApiError } from "../../../lib/api-error-message";
import { useSearchParams } from "react-router-dom";
import { humanizeEnumLabel } from "../../../lib/humanizeEnumLabel";

function addDaysIso(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  const t = Date.UTC(y, m - 1, d) + days * 86_400_000;
  const dt = new Date(t);
  const yy = dt.getUTCFullYear();
  const mm = String(dt.getUTCMonth() + 1).padStart(2, "0");
  const dd = String(dt.getUTCDate()).padStart(2, "0");
  return `${yy}-${mm}-${dd}`;
}

const EMPTY_TEMP_COVER_FORM = {
  unitId: "" as string | null,
  primaryDriverId: "" as string | null,
  coverDriverId: "" as string | null,
  startDate: companyToday(),
  endDate: companyToday(),
  notes: "",
};

export function DriverSchedulerGridPage() {
  const driverId = useSearchParams()[0].get("driver_id") ?? undefined;
  const unitId = useSearchParams()[0].get("unit_id") ?? undefined;
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [windowDays, setWindowDays] = useState(30);
  const [tempCoverModalOpen, setTempCoverModalOpen] = useState(false);
  const [tempCoverForm, setTempCoverForm] = useState(EMPTY_TEMP_COVER_FORM);
  const [cancelTarget, setCancelTarget] = useState<TempAssignment | null>(null);
  const [cancelReason, setCancelReason] = useState("");
  const range = useMemo(() => {
    // Company-local "today" (Central), not UTC — otherwise the grid starts on tomorrow's column
    // in the evening. See lib/businessDate.
    const start = companyToday();
    return { start, end: addDaysIso(start, windowDays - 1) };
  }, [windowDays]);

  const query = useQuery({
    queryKey: ["driver-scheduler", "grid", operatingCompanyId, range.start, range.end],
    enabled: Boolean(operatingCompanyId),
    queryFn: () => driverSchedulerOfficeApi.getGrid(operatingCompanyId, range.start, range.end),
  });

  const days: string[] = useMemo(() => {
    const out: string[] = [];
    let cur = range.start;
    while (cur <= range.end) {
      out.push(cur);
      cur = addDaysIso(cur, 1);
    }
    return out;
  }, [range.start, range.end]);

  const cellByDriverDay = useMemo(() => {
    const m = new Map<string, string>();
    for (const row of query.data?.leave_day_cells ?? []) {
      const key = `${String(row.driver_id)}|${String(row.leave_date)}`;
      m.set(key, String(row.leave_type));
    }
    return m;
  }, [query.data?.leave_day_cells]);

  // SAFETY-TEMP-COVER-ASSIGNMENTS-ZERO-FE-CALLERS — the backend list/create/cancel endpoints
  // (GAP-81) had zero frontend callers anywhere. This is the reachable UI: a section on the
  // Driver Scheduler page listing active temp-cover assignments, a create modal (unit + primary
  // driver + cover driver + date range, all via the canonical pickers — never a raw-id input), and
  // a cancel affordance with a required reason, matching the void/cancel pattern used everywhere
  // else in this app.
  const tempAssignmentsQuery = useQuery({
    queryKey: ["driver-scheduler", "temp-assignments", operatingCompanyId, driverId, unitId],
    queryFn: () => driverSchedulerOfficeApi.listTempAssignments(operatingCompanyId, { driver_id: driverId, unit_id: unitId }),
    enabled: Boolean(operatingCompanyId),
  });
  const tempAssignments = tempAssignmentsQuery.data?.assignments ?? [];

  const assignMutation = useMutation({
    mutationFn: () => {
      if (!tempCoverForm.unitId || !tempCoverForm.primaryDriverId || !tempCoverForm.coverDriverId) {
        throw new Error("Unit, primary driver, and cover driver are all required.");
      }
      return driverSchedulerOfficeApi.assignTempCover(operatingCompanyId, {
        unit_id: tempCoverForm.unitId,
        primary_driver_id: tempCoverForm.primaryDriverId,
        cover_driver_id: tempCoverForm.coverDriverId,
        start_date: tempCoverForm.startDate,
        end_date: tempCoverForm.endDate,
        notes: tempCoverForm.notes.trim() || undefined,
      });
    },
    onSuccess: () => {
      pushToast("Temp cover assigned", "success");
      setTempCoverModalOpen(false);
      setTempCoverForm(EMPTY_TEMP_COVER_FORM);
      void queryClient.invalidateQueries({ queryKey: ["driver-scheduler", "temp-assignments", operatingCompanyId] });
    },
    onError: (err) => pushToast(userFacingApiError(err, "Failed to assign temp cover"), "error"),
  });

  const cancelMutation = useMutation({
    mutationFn: () => {
      if (!cancelTarget) throw new Error("no target");
      return driverSchedulerOfficeApi.cancelTempCover(operatingCompanyId, cancelTarget.id, cancelReason.trim());
    },
    onSuccess: () => {
      pushToast("Temp cover assignment cancelled", "success");
      setCancelTarget(null);
      setCancelReason("");
      void queryClient.invalidateQueries({ queryKey: ["driver-scheduler", "temp-assignments", operatingCompanyId] });
    },
    onError: (err) => pushToast(userFacingApiError(err, "Failed to cancel"), "error"),
  });

  return (
    <div className="space-y-3">
      <PageHeader
        title="Driver Scheduler"
        subtitle={`${range.start} through ${range.end} — fleet leave grid`}
        actions={
          <Button
            data-testid="driver-scheduler-assign-temp-cover"
            disabled={!operatingCompanyId}
            onClick={() => {
              setTempCoverForm(EMPTY_TEMP_COVER_FORM);
              setTempCoverModalOpen(true);
            }}
          >
            + Assign Temp Cover
          </Button>
        }
      />

      {!operatingCompanyId ? <div className="text-sm text-gray-500">Select an operating company to view the driver schedule.</div> : null}

      <div className="flex flex-wrap items-center gap-2 rounded-sm border border-gray-200 bg-white p-2 text-xs">
        <span className="font-semibold text-gray-600">Range</span>
        {[7, 14, 30, 40].map((d) => (
          <button
            key={d}
            type="button"
            className={`rounded-sm px-2 py-1 ${windowDays === d ? "bg-slate-800 text-white" : "bg-gray-100 text-gray-700"}`}
            onClick={() => setWindowDays(d)}
          >
            {d}d
          </button>
        ))}
      </div>

      {query.isLoading ? <div className="text-sm text-gray-500">Loading grid…</div> : null}
      {query.isError ? (
        <ListErrorState
          title="Couldn't load scheduler grid"
          {...formatQueryErrorDetail(query.error)}
          onRetry={() => void query.refetch()}
        />
      ) : null}

      {query.data ? (
        <div className="max-w-[calc(100vw-48px)] overflow-auto rounded-sm border border-gray-200 bg-white">
          <table className="min-w-max border-collapse text-[10px]">
            <thead>
              <tr>
                <th className="sticky left-0 z-10 border-b border-r bg-gray-50 px-2 py-1 text-left">Driver</th>
                <th className="border-b border-r bg-gray-50 px-1 py-1">Unit</th>
                {days.map((d) => (
                  <th key={d} className="border-b border-gray-100 px-0.5 py-1 text-center font-normal text-gray-500">
                    {d.slice(5)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {(query.data.drivers ?? []).map((dr) => {
                const driverId = String(dr.driver_id);
                const name = entityLabel(dr.driver_name, driverId, "Driver");
                const unitId = (dr as { unit_id?: string | null }).unit_id;
                const unitLabel = entityLabel(dr.unit_number, unitId, "Unit") ?? "—";
                return (
                  <tr key={driverId} className="border-t border-gray-100">
                    <td className="sticky left-0 z-10 border-r bg-white px-2 py-0.5 text-xs font-medium text-gray-900">
                      <EntityLink kind="driver" id={driverId} label={name} />
                    </td>
                    <td className="border-r px-1 py-0.5 text-gray-600">
                      {unitId ? (
                        <EntityLink kind="unit" id={String(unitId)} label={unitLabel} data-testid="driver-scheduler-grid-unit-link" />
                      ) : (
                        unitLabel
                      )}
                    </td>
                    {days.map((d) => {
                      const lt = cellByDriverDay.get(`${driverId}|${d}`);
                      const bg =
                        lt === "vacation"
                          ? "bg-slate-100"
                          : lt === "sick"
                            ? "bg-slate-100"
                            : lt === "personal"
                              ? "bg-orange-100"
                              : lt === "wfh"
                                ? "bg-slate-100"
                                : "bg-white";
                      const label = lt ? String(lt).slice(0, 3) : "";
                      return (
                        <td key={d} className={`border-l border-gray-50 px-0 py-0 text-center ${bg}`} title={lt ? humanizeEnumLabel(lt) : ""}>
                          <span className="text-[9px] text-gray-700">{label}</span>
                        </td>
                      );
                    })}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : null}

      {query.data && (query.data.drivers ?? []).length === 0 ? (
        <div className="text-sm text-gray-500">No drivers are available for this operating company.</div>
      ) : null}

      {query.data?.pending_requests?.length ? (
        <div className="rounded-sm border border-slate-200 bg-slate-50 p-2 text-xs text-slate-700">
          <div className="font-semibold">Pending in this window</div>
          <ul className="list-inside list-disc">
            {query.data.pending_requests.map((p) => (
              <li key={String(p.id)}>
                {String(p.request_number)} · {humanizeEnumLabel(p.leave_type)} · {String(p.start_date)}–{String(p.end_date)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="driver-scheduler-temp-cover-section">
        <h3 className="mb-2 text-sm font-semibold text-gray-800">Temp cover assignments</h3>
        {tempAssignmentsQuery.isLoading ? <div className="text-xs text-gray-500">Loading…</div> : null}
        {tempAssignmentsQuery.isError ? (
          <ListErrorState
            title="Couldn't load temp cover assignments"
            {...formatQueryErrorDetail(tempAssignmentsQuery.error)}
            onRetry={() => void tempAssignmentsQuery.refetch()}
          />
        ) : null}
        {!tempAssignmentsQuery.isLoading && !tempAssignmentsQuery.isError && tempAssignments.length === 0 ? (
          <p className="text-xs text-gray-500">No active temp cover assignments.</p>
        ) : null}
        {tempAssignments.length > 0 ? (
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-left uppercase tracking-wide text-gray-500">
                <th className="py-1 pr-2">Unit</th>
                <th className="py-1 pr-2">Primary driver</th>
                <th className="py-1 pr-2">Cover driver</th>
                <th className="py-1 pr-2">Dates</th>
                <th className="py-1 pr-2">Notes</th>
                <th className="py-1 pr-2" />
              </tr>
            </thead>
            <tbody>
              {tempAssignments.map((a) => (
                <tr key={a.id} className="border-b border-gray-100 last:border-0" data-testid="driver-scheduler-temp-cover-row">
                  <td className="py-1 pr-2">
                    <EntityLink kind="unit" id={a.unit_id} label={entityLabel(a.unit_number, a.unit_id, "Unit")} />
                  </td>
                  <td className="py-1 pr-2">
                    <EntityLink kind="driver" id={a.primary_driver_id} label={entityLabel(a.primary_driver_name, a.primary_driver_id, "Driver")} />
                  </td>
                  <td className="py-1 pr-2">
                    <EntityLink kind="driver" id={a.cover_driver_id} label={entityLabel(a.cover_driver_name, a.cover_driver_id, "Driver")} />
                  </td>
                  <td className="py-1 pr-2 text-gray-600">
                    {formatDateUS(a.start_date)}–{formatDateUS(a.end_date)}
                  </td>
                  <td className="py-1 pr-2 text-gray-600">{a.notes || "—"}</td>
                  <td className="py-1 pr-2">
                    <Button
                      size="sm"
                      variant="danger"
                      data-testid="driver-scheduler-temp-cover-cancel"
                      onClick={() => {
                        setCancelTarget(a);
                        setCancelReason("");
                      }}
                    >
                      Cancel
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </div>

      <Modal
        open={tempCoverModalOpen}
        onClose={() => setTempCoverModalOpen(false)}
        title="Assign temp cover"
      >
        <div className="space-y-3 text-sm">
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Unit
            <div className="mt-1">
              <EntityPicker
                kind="unit"
                operatingCompanyId={operatingCompanyId}
                value={tempCoverForm.unitId}
                onChange={(unitId) => setTempCoverForm((f) => ({ ...f, unitId }))}
                allowCreate
              />
            </div>
          </label>
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Primary driver (going on leave)
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={tempCoverForm.primaryDriverId}
                onChange={(primaryDriverId) => setTempCoverForm((f) => ({ ...f, primaryDriverId }))}
                shell="modal"
              />
            </div>
          </label>
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Cover driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={tempCoverForm.coverDriverId}
                onChange={(coverDriverId) => setTempCoverForm((f) => ({ ...f, coverDriverId }))}
                shell="modal"
              />
            </div>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <div className="block text-xs font-semibold uppercase text-gray-600">
              <span>Start date</span>
              <div className="mt-1">
                <DatePicker
                  value={tempCoverForm.startDate}
                  onChange={(startDate) => setTempCoverForm((f) => ({ ...f, startDate, endDate: f.endDate < startDate ? startDate : f.endDate }))}
                />
              </div>
            </div>
            <div className="block text-xs font-semibold uppercase text-gray-600">
              <span>End date</span>
              <div className="mt-1">
                <DatePicker
                  value={tempCoverForm.endDate}
                  min={tempCoverForm.startDate}
                  onChange={(endDate) => setTempCoverForm((f) => ({ ...f, endDate }))}
                />
              </div>
            </div>
          </div>
          <label className="block text-xs font-semibold uppercase text-gray-600">
            Notes (optional)
            <textarea
              className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
              value={tempCoverForm.notes}
              onChange={(e) => setTempCoverForm((f) => ({ ...f, notes: e.target.value }))}
            />
          </label>
          <div className="flex justify-end gap-2">
            <Button variant="secondary" onClick={() => setTempCoverModalOpen(false)}>
              Cancel
            </Button>
            <Button
              loading={assignMutation.isPending}
              disabled={!tempCoverForm.unitId || !tempCoverForm.primaryDriverId || !tempCoverForm.coverDriverId}
              onClick={() => assignMutation.mutate()}
            >
              Assign
            </Button>
          </div>
        </div>
      </Modal>

      <Modal
        open={Boolean(cancelTarget)}
        onClose={() => setCancelTarget(null)}
        title="Cancel temp cover assignment"
      >
        {cancelTarget ? (
          <div className="space-y-3 text-sm">
            <p className="text-xs text-gray-600">
              Cancel the cover assignment for{" "}
              <EntityLink kind="driver" id={cancelTarget.cover_driver_id} label={entityLabel(cancelTarget.cover_driver_name, cancelTarget.cover_driver_id, "Driver")} /> on{" "}
              <EntityLink kind="unit" id={cancelTarget.unit_id} label={entityLabel(cancelTarget.unit_number, cancelTarget.unit_id, "Unit")} />?
            </p>
            <label className="block text-xs font-semibold uppercase text-gray-600">
              Reason
              <textarea
                className="mt-1 min-h-16 w-full rounded-sm border border-gray-300 px-2 py-1 text-sm"
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Why is this assignment being cancelled?"
              />
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="secondary" onClick={() => setCancelTarget(null)}>
                Keep assignment
              </Button>
              <Button variant="danger" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
                Cancel assignment
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </div>
  );
}
