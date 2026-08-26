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
import { Button } from "../../components/Button";
import { ListErrorState } from "../../components/ListErrorState";
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { useToast } from "../../components/Toast";
import { useAuth } from "../../auth/useAuth";
import { SelectCombobox } from "../../components/shared/SelectCombobox";

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

export function WOTimeTrackingPanel({ workOrderId, operatingCompanyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const auth = useAuth();

  const [actorKind, setActorKind] = useState<(typeof ACTORS)[number]>("internal_mechanic");
  const [laborRate, setLaborRate] = useState("");
  const [notes, setNotes] = useState("");
  const [manualStart, setManualStart] = useState("");
  const [manualEnd, setManualEnd] = useState("");

  // MAINT-MONEY-F6626-WO-TIME-RATE-NATIVE-PROMPT-AND-MUTABLE-SCOPE — the "Rate" action used
  // window.prompt() (unvalidated raw number, bypassing canonical QBO money chrome) and its
  // patchMut closed over the LIVE workOrderId/operatingCompanyId props. A work-order/company
  // transition while the request was in flight could update the wrong entry's rate under the
  // wrong company, or invalidate/toast for a no-longer-visible panel. Same scope-generation-
  // snapshot idiom as units/UnitPermitsTab.tsx's deleteMutation and
  // insurance/PaymentScheduleTab.tsx's markPaidMutation.
  const scopeGenerationRef = useRef(0);
  useEffect(() => {
    scopeGenerationRef.current += 1;
  }, [workOrderId, operatingCompanyId]);

  const [rateEdit, setRateEdit] = useState<{
    entryId: string;
    workOrderId: string;
    operatingCompanyId: string;
    generation: number;
  } | null>(null);
  const [rateEditCents, setRateEditCents] = useState<number | null>(null);

  const laborCodesQuery = useQuery({
    queryKey: ["maintenance", "labor-codes", operatingCompanyId],
    queryFn: () => listMaintenanceLaborCodes(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });
  const laborCodes = laborCodesQuery.data?.labor_codes ?? [];

  const entriesQuery = useQuery({
    queryKey: ["wo-time-entries", workOrderId, operatingCompanyId],
    queryFn: () => listWoTimeEntries(workOrderId, operatingCompanyId),
    enabled: Boolean(workOrderId && operatingCompanyId),
  });

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ["wo-time-entries", workOrderId, operatingCompanyId] });

  const startMut = useMutation({
    mutationFn: () =>
      startWoTimeEntry(workOrderId, {
        operating_company_id: operatingCompanyId,
        actor_kind: actorKind,
        labor_rate_cents_per_hour: laborRate.trim() ? Number(laborRate) : null,
        notes: notes.trim() || null,
      }),
    onSuccess: () => {
      pushToast("Timer started", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Start failed"), "error"),
  });

  const stopMut = useMutation({
    mutationFn: (entryId: string) => stopWoTimeEntry(entryId, operatingCompanyId),
    onSuccess: () => {
      pushToast("Timer stopped", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Stop failed"), "error"),
  });

  const manualMut = useMutation({
    mutationFn: () =>
      createWoTimeEntryManual({
        operating_company_id: operatingCompanyId,
        work_order_id: workOrderId,
        actor_kind: actorKind,
        labor_rate_cents_per_hour: laborRate.trim() ? Number(laborRate) : null,
        notes: notes.trim() || null,
        started_at: manualStart.trim(),
        ended_at: manualEnd.trim(),
      }),
    onSuccess: () => {
      pushToast("Manual time entry saved", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Manual entry failed"), "error"),
  });

  const patchMut = useMutation({
    mutationFn: (args: {
      entryId: string;
      workOrderId: string;
      operatingCompanyId: string;
      generation: number;
      labor_rate_cents_per_hour: number | null;
    }) =>
      patchWoTimeEntry(args.entryId, {
        operating_company_id: args.operatingCompanyId,
        labor_rate_cents_per_hour: args.labor_rate_cents_per_hour,
      }),
    onSuccess: (_data, args) => {
      if (args.generation !== scopeGenerationRef.current) return;
      pushToast("Labor rate updated", "success");
      void queryClient.invalidateQueries({ queryKey: ["wo-time-entries", args.workOrderId, args.operatingCompanyId] });
    },
    onError: (e: unknown, args) => {
      if (args.generation !== scopeGenerationRef.current) return;
      pushToast(String((e as Error)?.message ?? "Update failed"), "error");
    },
  });
  const resetPatchMut = patchMut.reset;

  useEffect(() => {
    resetPatchMut();
    setRateEdit(null);
  }, [workOrderId, operatingCompanyId, resetPatchMut]);

  const deleteMut = useMutation({
    mutationFn: (entryId: string) => deleteWoTimeEntry(entryId, operatingCompanyId),
    onSuccess: () => {
      pushToast("Entry removed", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Delete failed"), "error"),
  });

  const entries = entriesQuery.data?.time_entries ?? [];
  const openEntries = useMemo(() => entries.filter((row) => !row.ended_at), [entries]);

  const isOwnerAdmin = auth.user?.role === "Owner" || auth.user?.role === "Administrator";

  const columns = useMemo((): Array<ParityColumn<WoTimeEntryRow>> => {
    return [
      {
        key: "labor_code",
        label: "Labor code",
        sortable: true,
        sortValue: (row) => laborEntryCodeLabel(row, laborCodes),
        render: (row) => <span className="text-slate-900">{laborEntryCodeLabel(row, laborCodes)}</span>,
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
    <div className="rounded-sm border border-gray-200 bg-white p-3 text-sm" data-testid="wo-time-tracking-panel">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Labor time tracking</div>
      <p className="mt-1 text-xs text-slate-600">Start/stop timers or add manual ranges. Rates drive computed labor cost.</p>

      <div className="mt-3 grid gap-2 md:grid-cols-3">
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
          Labor rate (¢/hr)
          <input
            className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="optional"
          />
        </label>
        <label className="text-xs text-slate-600 md:col-span-1">
          Notes
          <input className="mt-1 w-full rounded-sm border border-gray-300 px-2 py-1 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void startMut.mutateAsync()} disabled={startMut.isPending || openEntries.length > 0}>
          Start timer
        </Button>
        {openEntries.length > 0 ? <span className="text-xs text-slate-600">An open timer exists — stop it before starting another.</span> : null}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-slate-600">Manual entry</div>
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
          <Button type="button" size="sm" variant="secondary" onClick={() => void manualMut.mutateAsync()} disabled={manualMut.isPending}>
            Save manual entry
          </Button>
        </div>
      </div>

      <div className="mt-4" data-testid="wo-time-tracking-entries-table">
        {entriesQuery.isError ? (
          <ListErrorState
            title="Couldn't load time entries"
            status={typeof entriesErr?.status === "number" ? entriesErr.status : 0}
            message={entriesErr?.message}
            onRetry={() => void entriesQuery.refetch()}
          />
        ) : (
          <ParityTable
            storageKey="wo-time-tracking-entries"
            tableTestId="wo-time-tracking-entries-parity"
            columns={columns}
            rows={entries}
            rowKey={(row) => String(row.id ?? "")}
            loading={entriesQuery.isLoading}
            emptyText="No time entries yet."
            initialPageSize={25}
            pageSizeOptions={[10, 25, 50]}
            rowActions={(row) => {
              const id = String(row.id ?? "");
              return (
                <span className="inline-flex flex-wrap justify-end gap-2">
                  {!row.ended_at ? (
                    <Button type="button" size="sm" variant="secondary" onClick={() => void stopMut.mutateAsync(id)} disabled={stopMut.isPending}>
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
                          setRateEditCents((row.labor_rate_cents_per_hour as number | null | undefined) ?? null);
                          setRateEdit({ entryId: id, workOrderId, operatingCompanyId, generation: scopeGenerationRef.current });
                        }}
                        disabled={patchMut.isPending}
                      >
                        Rate
                      </Button>
                      <Button type="button" size="sm" variant="danger" onClick={() => void deleteMut.mutateAsync(id)} disabled={deleteMut.isPending}>
                        Remove
                      </Button>
                    </>
                  ) : null}
                </span>
              );
            }}
          />
        )}
      </div>

      {/* MAINT-MONEY-F6626 — canonical QBO money chrome, replaces the native window.prompt(). */}
      <Modal open={rateEdit != null} onClose={() => setRateEdit(null)} title="Edit labor rate">
        <div className="space-y-3 text-sm">
          <label className="block">
            Labor rate ($/hr)
            {/* cents-mode: user types dollars, labor_rate_cents_per_hour stored unchanged. */}
            <MoneyInput valueCents={rateEditCents} onChangeCents={setRateEditCents} className="mt-1 w-full" ariaLabel="Labor rate ($/hr)" />
          </label>
          <div className="flex justify-end gap-2">
            <Button size="sm" variant="secondary" onClick={() => setRateEdit(null)}>
              Cancel
            </Button>
            <Button
              size="sm"
              loading={patchMut.isPending}
              disabled={rateEditCents == null || rateEditCents < 0 || !Number.isFinite(rateEditCents)}
              onClick={async () => {
                if (!rateEdit || rateEditCents == null) return;
                try {
                  await patchMut.mutateAsync({ ...rateEdit, labor_rate_cents_per_hour: rateEditCents });
                  setRateEdit(null);
                } catch {
                  // patchMut.onError already surfaced the toast (guarded by the same generation check).
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
