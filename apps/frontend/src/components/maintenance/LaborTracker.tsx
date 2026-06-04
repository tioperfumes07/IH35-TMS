import { useEffect, useMemo, useState } from "react";
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
import { Button } from "../Button";
import { useToast } from "../Toast";
import { useAuth } from "../../auth/useAuth";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  workOrderId: string;
  operatingCompanyId: string;
};

const ACTORS = ["vendor", "internal_mechanic", "driver", "admin"] as const;

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

  useEffect(() => {
    if (!laborCodeId) return;
    const selected = laborCodes.find((row) => row.id === laborCodeId);
    if (selected?.rate_cents_per_hour != null) {
      setLaborRate(String(selected.rate_cents_per_hour));
    }
  }, [laborCodeId, laborCodes]);

  const startMut = useMutation({
    mutationFn: () =>
      startWoTimeEntry(workOrderId, {
        operating_company_id: operatingCompanyId,
        actor_kind: actorKind,
        labor_code_id: laborCodeId || null,
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
        labor_code_id: laborCodeId || null,
        labor_rate_cents_per_hour: laborRate.trim() ? Number(laborRate) : null,
        notes: notes.trim() || null,
        started_at: manualStart.trim(),
        ended_at: manualEnd.trim(),
      }),
    onSuccess: () => {
      pushToast("Manual time entry saved", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Book manual labor range failed"), "error"),
  });

  const patchMut = useMutation({
    mutationFn: (args: { entryId: string; labor_rate_cents_per_hour: number | null }) =>
      patchWoTimeEntry(args.entryId, {
        operating_company_id: operatingCompanyId,
        labor_rate_cents_per_hour: args.labor_rate_cents_per_hour,
      }),
    onSuccess: () => {
      pushToast("Labor rate updated", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Update failed"), "error"),
  });

  const deleteMut = useMutation({
    mutationFn: (entryId: string) => deleteWoTimeEntry(entryId, operatingCompanyId),
    onSuccess: () => {
      pushToast("Entry removed", "success");
      invalidate();
    },
    onError: (e: unknown) => pushToast(String((e as Error)?.message ?? "Delete failed"), "error"),
  });

  const entries = entriesQuery.data?.time_entries ?? [];
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

  const renderRow = (row: WoTimeEntryRow) => {
    const id = String(row.id ?? "");
    const started = row.started_at ? String(row.started_at) : "";
    const ended = row.ended_at ? String(row.ended_at) : "open";
    const mins = row.duration_minutes != null ? String(row.duration_minutes) : "—";
    const cost = row.computed_labor_cost_cents != null ? String(row.computed_labor_cost_cents) : "—";
    const rate = row.labor_rate_cents_per_hour != null ? String(row.labor_rate_cents_per_hour) : "";
    return (
      <tr key={id} className="border-b border-gray-100 text-[12px]">
        <td className="py-2 pr-2 font-mono text-[11px]">{id.slice(0, 8)}…</td>
        <td className="py-2 pr-2">{String(row.actor_kind ?? "")}</td>
        <td className="py-2 pr-2 text-xs text-slate-600">{started}</td>
        <td className="py-2 pr-2 text-xs text-slate-600">{ended}</td>
        <td className="py-2 pr-2">{mins}</td>
        <td className="py-2 pr-2">{cost}</td>
        <td className="py-2 pr-2 text-right">
          {!row.ended_at ? (
            <Button type="button" size="sm" variant="secondary" onClick={() => void stopMut.mutateAsync(id)} disabled={stopMut.isPending}>
              Stop
            </Button>
          ) : null}
          {isOwnerAdmin ? (
            <span className="ml-2 inline-flex gap-2">
              <Button
                type="button"
                size="sm"
                variant="secondary"
                onClick={() => {
                  const next = window.prompt("Labor rate (cents/hour)", rate || "0");
                  if (next === null) return;
                  void patchMut.mutateAsync({ entryId: id, labor_rate_cents_per_hour: Number(next) });
                }}
                disabled={patchMut.isPending}
              >
                Rate
              </Button>
              <Button type="button" size="sm" variant="danger" onClick={() => void deleteMut.mutateAsync(id)} disabled={deleteMut.isPending}>
                Remove
              </Button>
            </span>
          ) : null}
        </td>
      </tr>
    );
  };

  return (
    <div className="rounded border border-gray-200 bg-white p-3 text-sm" data-testid="maint-labor-tracker">
      <div className="text-xs font-semibold uppercase tracking-wide text-slate-500">Mechanic labor</div>
      <p className="mt-1 text-xs text-slate-600">Start/stop timers or add manual ranges. Rates drive computed labor cost.</p>

      <div className="mt-3 grid gap-2 md:grid-cols-4">
        <label className="text-xs text-slate-600">
          Actor kind
          <SelectCombobox
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]"
            value={actorKind}
            onChange={(e) => setActorKind(e.target.value as (typeof ACTORS)[number])}
          >
            {ACTORS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs text-slate-600">
          Labor code
          <SelectCombobox
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]"
            value={laborCodeId}
            onChange={(e) => setLaborCodeId(e.target.value)}
            data-testid="maint-labor-code-select"
          >
            <option value="">Select labor code</option>
            {laborCodes.map((row) => (
              <option key={row.id} value={row.id}>
                {row.code} — {row.display_name}
              </option>
            ))}
          </SelectCombobox>
        </label>
        <label className="text-xs text-slate-600">
          Labor rate (¢/hr)
          <input
            className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]"
            value={laborRate}
            onChange={(e) => setLaborRate(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="optional"
          />
        </label>
        <label className="text-xs text-slate-600">
          Notes
          <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <Button type="button" size="sm" onClick={() => void startMut.mutateAsync()} disabled={startMut.isPending || Boolean(openEntry)}>
          Clock in
        </Button>
        {Boolean(openEntry) ? <span className="text-xs text-amber-700">An open timer exists — stop it before starting another.</span> : null}
      </div>

      <div className="mt-4 border-t border-gray-100 pt-3">
        <div className="text-xs font-semibold text-slate-600">Book manual labor range</div>
        <div className="mt-2 grid gap-2 md:grid-cols-2">
          <label className="text-xs text-slate-600">
            Started (ISO)
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]" value={manualStart} onChange={(e) => setManualStart(e.target.value)} />
          </label>
          <label className="text-xs text-slate-600">
            Ended (ISO)
            <input className="mt-1 w-full rounded border border-gray-300 px-2 py-1 text-[13px]" value={manualEnd} onChange={(e) => setManualEnd(e.target.value)} />
          </label>
        </div>
        <div className="mt-2">
          <Button type="button" size="sm" variant="secondary" onClick={() => void manualMut.mutateAsync()} disabled={manualMut.isPending}>
            Book labor entry
          </Button>
        </div>
      </div>

      <div
        className={`mt-3 rounded border px-3 py-2 text-sm ${openEntry ? "border-amber-200 bg-amber-50 text-amber-900" : "border-gray-200 bg-gray-50 text-gray-700"}`}
        data-testid="maint-labor-running-timer"
      >
        {runningLabel}
      </div>

      <div className="mt-4 overflow-auto" data-testid="maint-labor-entries-table">
        <table className="min-w-full border-collapse text-left">
          <thead className="text-[11px] uppercase tracking-wide text-slate-500">
            <tr>
              <th className="border-b border-gray-200 py-2 pr-2">ID</th>
              <th className="border-b border-gray-200 py-2 pr-2">Actor</th>
              <th className="border-b border-gray-200 py-2 pr-2">Start</th>
              <th className="border-b border-gray-200 py-2 pr-2">End</th>
              <th className="border-b border-gray-200 py-2 pr-2">Min</th>
              <th className="border-b border-gray-200 py-2 pr-2">Cost ¢</th>
              <th className="border-b border-gray-200 py-2 pr-2 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>{entries.map(renderRow)}</tbody>
        </table>
        {!entriesQuery.isLoading && entries.length === 0 ? <div className="py-3 text-xs text-slate-500">No time entries yet.</div> : null}
      </div>
    </div>
  );
}
