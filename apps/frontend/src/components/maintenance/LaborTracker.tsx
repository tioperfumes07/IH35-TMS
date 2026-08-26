import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createWoTimeEntryManual,
  deleteWoTimeEntry,
  listWoTimeEntries,
  patchWoTimeEntry,
  startWoTimeEntry,
  stopWoTimeEntry,
  type WoTimeEntryRow,
} from "../../api/woTimeEntries";
import { listMaintenanceLaborCodes } from "../../api/maintenance";
import { properEnumOrFilterLabel } from "../../lib/properDisplayText";
import { Button } from "../Button";
import { ListErrorState } from "../ListErrorState";
import { ParityTable, type ParityColumn } from "../parity/ParityTable";
import { useToast } from "../Toast";
import { useAuth } from "../../auth/useAuth";
import { ReferenceSelect } from "../parity/ReferenceSelect";
import { SelectCombobox } from "../shared/SelectCombobox";
import { Modal } from "../Modal";
import { MoneyInput } from "../forms/MoneyInput";

type Props = {
  workOrderId: string;
  operatingCompanyId: string;
};

const ACTORS = ["vendor", "internal_mechanic", "driver", "admin"] as const;

type LaborCodeOption = { id: string; code: string; display_name: string };

function laborEntryCodeLabel(row: WoTimeEntryRow, codes: LaborCodeOption[]): string {
  const embedded = row.labor_code as { code?: string; display_name?: string } | null | undefined;
  if (embedded?.code) {
    return embedded.display_name ? `${embedded.code} — ${embedded.display_name}` : embedded.code;
  }
  const codeId = row.labor_code_id as string | undefined;
  if (codeId) {
    const match = codes.find((c) => c.id === codeId);
    if (match) return `${match.code} — ${match.display_name}`;
  }
  return "General labor";
}

export function LaborTracker({ workOrderId, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();

  const [actorKind, setActorKind] = useState<(typeof ACTORS)[number]>("internal_mechanic");
  const [laborCodeId, setLaborCodeId] = useState("");
  const [laborRate, setLaborRate] = useState("");
  const [notes, setNotes] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");
  const [tick, setTick] = useState(0);
  const [rateTarget, setRateTarget] = useState<{ entryId: string; currentRateCents: number | null } | null>(null);
  const [rateValueCents, setRateValueCents] = useState<number | null>(null);
  const actionGenerationRef = useRef(0);

  const laborCodesQuery = useQuery({
    queryKey: ["maintenance", "labor-codes", operatingCompanyId],
    queryFn: () => listMaintenanceLaborCodes(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const laborCodes = laborCodesQuery.isError ? [] : laborCodesQuery.data?.labor_codes ?? [];

  const entriesQuery = useQuery({
    queryKey: ["wo-time-entries", workOrderId, operatingCompanyId],
    queryFn: () => listWoTimeEntries(workOrderId, operatingCompanyId),
    enabled: Boolean(workOrderId && operatingCompanyId),
  });

  const invalidate = (submittedWorkOrderId: string, submittedCompanyId: string) =>
    void queryClient.invalidateQueries({ queryKey: ["wo-time-entries", submittedWorkOrderId, submittedCompanyId] });

  useEffect(() => {
    if (!laborCodeId) return;
    const selected = laborCodes.find((row) => row.id === laborCodeId);
    if (selected?.rate_cents_per_hour != null) {
      setLaborRate(String(selected.rate_cents_per_hour));
    }
  }, [laborCodeId, laborCodes]);

  const startMut = useMutation({
    mutationFn: (input: { workOrderId: string; companyId: string; generation: number; actorKind: (typeof ACTORS)[number]; laborCodeId: string | null; laborRateCents: number | null; notes: string | null }) =>
      startWoTimeEntry(input.workOrderId, {
        operating_company_id: input.companyId,
        actor_kind: input.actorKind,
        labor_code_id: input.laborCodeId,
        labor_rate_cents_per_hour: input.laborRateCents,
        notes: input.notes,
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Timer started", "success");
      invalidate(input.workOrderId, input.companyId);
    },
    onError: (e: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(String((e as Error)?.message ?? "Start failed"), "error");
    },
  });

  const stopMut = useMutation({
    mutationFn: (input: { entryId: string; workOrderId: string; companyId: string; generation: number }) => stopWoTimeEntry(input.entryId, input.companyId),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Timer stopped", "success");
      invalidate(input.workOrderId, input.companyId);
    },
    onError: (e: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(String((e as Error)?.message ?? "Stop failed"), "error");
    },
  });

  const manualMut = useMutation({
    mutationFn: (input: { workOrderId: string; companyId: string; generation: number; actorKind: (typeof ACTORS)[number]; laborCodeId: string | null; laborRateCents: number | null; notes: string | null; startedAt: string; endedAt: string }) =>
      createWoTimeEntryManual({
        operating_company_id: input.companyId,
        work_order_id: input.workOrderId,
        actor_kind: input.actorKind,
        labor_code_id: input.laborCodeId,
        labor_rate_cents_per_hour: input.laborRateCents,
        notes: input.notes,
        started_at: input.startedAt,
        ended_at: input.endedAt,
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Manual time entry saved", "success");
      invalidate(input.workOrderId, input.companyId);
    },
    onError: (e: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(String((e as Error)?.message ?? "Book manual labor range failed"), "error");
    },
  });

  const patchMut = useMutation({
    mutationFn: (input: { entryId: string; workOrderId: string; companyId: string; generation: number; laborRateCents: number | null }) =>
      patchWoTimeEntry(input.entryId, {
        operating_company_id: input.companyId,
        labor_rate_cents_per_hour: input.laborRateCents,
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      setRateTarget(null);
      setRateValueCents(null);
      pushToast("Labor rate updated", "success");
      invalidate(input.workOrderId, input.companyId);
    },
    onError: (e: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(String((e as Error)?.message ?? "Update failed"), "error");
    },
  });

  const deleteMut = useMutation({
    mutationFn: (input: { entryId: string; workOrderId: string; companyId: string; generation: number }) => deleteWoTimeEntry(input.entryId, input.companyId),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Entry removed", "success");
      invalidate(input.workOrderId, input.companyId);
    },
    onError: (e: unknown, input) => {
      if (input.generation === actionGenerationRef.current) pushToast(String((e as Error)?.message ?? "Remove failed"), "error");
    },
  });

  useEffect(() => {
    actionGenerationRef.current += 1;
    startMut.reset();
    stopMut.reset();
    manualMut.reset();
    patchMut.reset();
    deleteMut.reset();
    setActorKind("internal_mechanic");
    setLaborCodeId("");
    setLaborRate("");
    setNotes("");
    setManualStart("");
    setManualEnd("");
    setRateTarget(null);
    setRateValueCents(null);
  }, [workOrderId, operatingCompanyId]);

  const entries = entriesQuery.isError ? [] : entriesQuery.data?.time_entries ?? [];
  const openEntry = useMemo(() => entries.find((row) => !row.ended_at) ?? null, [entries]);

  useEffect(() => {
    if (!openEntry?.started_at) return;
    const id = window.setInterval(() => setTick((value) => value + 1), 1000);
    return () => window.clearInterval(id);
  }, [openEntry?.id, openEntry?.started_at]);

  const runningLabel = openEntry?.started_at
    ? `Running: ${Math.max(0, Math.floor((Date.now() - Date.parse(String(openEntry.started_at))) / 1000))}s`
    : "No running timer";
  void tick;

  const isOwnerAdmin = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  const columns = useMemo((): Array<ParityColumn<WoTimeEntryRow>> => {
    return [
      {
        key: "labor_code",
        label: "Labor code",
        sortable: true,
        sortValue: (row) => laborEntryCodeLabel(row, laborCodes),
        render: (row) => <span className="text-gray-900">{laborEntryCodeLabel(row, laborCodes)}</span>,
      },
      {
        key: "actor_kind",
        label: "Actor",
        sortable: true,
        render: (row) => String(row.actor_kind ?? ""),
      },
      {
        key: "started_at",
        label: "Start",
        sortable: true,
        sortValue: (row) => (row.started_at ? Date.parse(String(row.started_at)) : 0),
        render: (row) => (row.started_at ? String(row.started_at) : ""),
      },
      {
        key: "ended_at",
        label: "End",
        sortable: true,
        sortValue: (row) => (row.ended_at ? Date.parse(String(row.ended_at)) : Number.POSITIVE_INFINITY),
        render: (row) => (row.ended_at ? String(row.ended_at) : "open"),
      },
      {
        key: "duration_minutes",
        label: "Min",
        sortable: true,
        render: (row) => (row.duration_minutes != null ? String(row.duration_minutes) : "—"),
      },
      {
        key: "computed_labor_cost_cents",
        label: "Cost ¢",
        sortable: true,
        render: (row) => (row.computed_labor_cost_cents != null ? String(row.computed_labor_cost_cents) : "—"),
      },
    ];
  }, [laborCodes]);

  const entriesErr = entriesQuery.error as { status?: number; message?: string } | null;

  return (
    <section
      className="overflow-hidden rounded-sm border border-gray-200 bg-white text-sm"
      data-testid="maint-labor-tracker"
    >
      <div className="border-b border-gray-200 bg-gray-50 px-3 py-2">
        <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mechanic labor</div>
        <p className="mt-1 text-xs text-slate-600">Start/stop timers or add manual ranges. Rates drive computed labor cost.</p>
      </div>

      <div className="space-y-3 p-3">
      <div className="grid gap-2 md:grid-cols-4">
        <label className="text-xs text-slate-600">
          Actor kind
          <SelectCombobox
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
            value={actorKind}
            onChange={(e) => setActorKind(e.target.value as (typeof ACTORS)[number])}
          >
            {ACTORS.map((a) => (
              <option key={a} value={a}>
                {properEnumOrFilterLabel(a)}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs text-slate-600">
          Labor code
          {/*
            LST-PICKER-01: ReferenceSelect first-row create → POST catalogs.maintenance_labor_codes
            (same table labor.routes.ts lists for WO time-entry labor_code_id).
          */}
          <div className="mt-1" data-testid="maint-labor-code-select">
            <ReferenceSelect
              value={laborCodeId || null}
              onChange={(next) => setLaborCodeId(next ?? "")}
              options={laborCodes.map((row) => ({
                value: row.id,
                label: `${row.code} — ${row.display_name}`,
              }))}
              createKind="maintenance_labor_code"
              operatingCompanyId={operatingCompanyId}
              placeholder={laborCodesQuery.isLoading ? "Loading labor codes…" : "Select labor code"}
              loading={laborCodesQuery.isLoading}
              disabled={laborCodesQuery.isError}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({ queryKey: ["maintenance", "labor-codes", operatingCompanyId] });
              }}
            />
            {laborCodesQuery.isError ? (
              <div className="mt-2">
                <ListErrorState
                  status={0}
                  message="Could not load labor codes."
                  onRetry={() => void laborCodesQuery.refetch()}
                />
              </div>
            ) : null}
          </div>
        </label>
        <label className="text-xs text-slate-600">
          Labor rate (¢/hr)
          <input
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="optional"
          />
        </label>
        <label className="text-xs text-slate-600">
          Notes
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          size="sm"
          onClick={() => startMut.mutate({
            workOrderId,
            companyId: operatingCompanyId,
            generation: actionGenerationRef.current,
            actorKind,
            laborCodeId: laborCodeId || null,
            laborRateCents: laborRate.trim() ? Number(laborRate) : null,
            notes: notes.trim() || null,
          })}
          disabled={startMut.isPending || Boolean(openEntry)}
        >
          Clock in
        </Button>
        {Boolean(openEntry) ? <span className="text-xs text-amber-700">An open timer exists — stop it before starting another.</span> : null}
      </div>

      <div className="border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-slate-600">Book manual labor range</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="text-xs text-slate-600">
            Started (ISO)
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            Ended (ISO)
            <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
          </label>
        </div>
        <div className="mt-2">
          <Button
            type="button"
            size="sm"
            variant="secondary"
            onClick={() => manualMut.mutate({
              workOrderId,
              companyId: operatingCompanyId,
              generation: actionGenerationRef.current,
              actorKind,
              laborCodeId: laborCodeId || null,
              laborRateCents: laborRate.trim() ? Number(laborRate) : null,
              notes: notes.trim() || null,
              startedAt: manualStart.trim(),
              endedAt: manualEnd.trim(),
            })}
            disabled={manualMut.isPending}
          >
            Book labor entry
          </Button>
        </div>
      </div>

      <div
        className={`rounded-sm border px-3 py-2 text-sm ${openEntry ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-700"}`}
        data-testid="maint-labor-running-timer"
      >
        {runningLabel}
      </div>
      </div>

      <div className="border-t border-gray-100" data-testid="maint-labor-entries-table">
        {entriesQuery.isError ? (
          <ListErrorState
            title="Couldn't load labor entries"
            status={typeof entriesErr?.status === "number" ? entriesErr.status : 0}
            message={entriesErr?.message}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : (
          <div className="mobile-table-fallback w-full" data-testid="mobile-optimized-table">
            <ParityTable
              storageKey="maint-labor-tracker-entries"
              tableTestId="maint-labor-entries-parity"
              columns={columns}
              rows={entries}
              rowKey={(row) => String(row.id ?? "")}
              loading={entriesQuery.isLoading}
              emptyText="No time entries yet."
              initialPageSize={25}
              pageSizeOptions={[10, 25, 50]}
              rowActions={(row) => {
                const id = String(row.id ?? "");
                const rate = row.labor_rate_cents_per_hour != null ? String(row.labor_rate_cents_per_hour) : "";
                return (
                  <span className="inline-flex flex-wrap justify-end gap-2">
                    {!row.ended_at ? (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        onClick={() => stopMut.mutate({ entryId: id, workOrderId, companyId: operatingCompanyId, generation: actionGenerationRef.current })}
                        disabled={stopMut.isPending}
                      >
                        Stop
                      </Button>
                    ) : null}
                    {isOwnerAdmin ? (
                      <>
                        <Button
                          type="button"
                          size="sm"
                          variant="secondary"
                          onClick={() => {
                            const currentRateCents = rate ? Number(rate) : null;
                            setRateTarget({ entryId: id, currentRateCents });
                            setRateValueCents(currentRateCents);
                          }}
                          disabled={patchMut.isPending}
                        >
                          Rate
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          variant="danger"
                          onClick={() => deleteMut.mutate({ entryId: id, workOrderId, companyId: operatingCompanyId, generation: actionGenerationRef.current })}
                          disabled={deleteMut.isPending}
                        >
                          Remove
                        </Button>
                      </>
                    ) : null}
                  </span>
                );
              }}
            />
          </div>
        )}
      </div>
      <Modal
        open={Boolean(rateTarget)}
        onClose={() => {
          setRateTarget(null);
          setRateValueCents(null);
          patchMut.reset();
        }}
        title="Update labor rate"
      >
        <div className="space-y-3">
          <label className="block text-xs font-medium text-slate-700">
            Labor rate per hour
            <MoneyInput
              valueCents={rateValueCents}
              onChangeCents={setRateValueCents}
              ariaLabel="Labor rate per hour"
              className="mt-1 w-full"
            />
          </label>
          {patchMut.isError ? <p className="text-xs text-red-700">{String((patchMut.error as Error)?.message ?? "Update failed")}</p> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setRateTarget(null)}>Cancel</Button>
            <Button
              type="button"
              disabled={!rateTarget || patchMut.isPending}
              loading={patchMut.isPending}
              onClick={() => {
                if (!rateTarget) return;
                patchMut.mutate({
                  entryId: rateTarget.entryId,
                  workOrderId,
                  companyId: operatingCompanyId,
                  generation: actionGenerationRef.current,
                  laborRateCents: rateValueCents,
                });
              }}
            >
              Save rate
            </Button>
          </div>
        </div>
      </Modal>
    </section>
  );
}
