import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createHosViolation, listHosViolations, voidHosViolation } from "../../../api/safetyV64";
import { VoidReasonModal } from "../../../components/accounting/VoidReasonModal";
import { DriverPickerWithCreate } from "../../../components/drivers/DriverPickerWithCreate";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useListState } from "../../../components/list-state";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type HosViolationRow = Record<string, unknown>;
type Source = "samsara_auto" | "manual_office" | "dot_citation";

function defaultOccurredAtIso(): string {
  return new Date().toISOString();
}

function toDatetimeLocalValue(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function HOSViolationsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [voidTarget, setVoidTarget] = useState<HosViolationRow | null>(null);
  const [form, setForm] = useState({
    driver_id: "",
    violation_type: "",
    occurred_at: defaultOccurredAtIso(),
    duration_minutes: "",
    source: "manual_office" as Source,
    notes: "",
  });

  const query = useQuery({
    queryKey: ["safety-v64", "hos-violations", companyId],
    queryFn: () => listHosViolations(companyId),
    enabled: Boolean(companyId),
  });

  const createMutation = useMutation({
    mutationFn: () =>
      createHosViolation(companyId, {
        driver_id: form.driver_id.trim(),
        violation_type: form.violation_type.trim(),
        occurred_at: new Date(form.occurred_at).toISOString(),
        duration_minutes: form.duration_minutes.trim() ? Number(form.duration_minutes) : null,
        source: form.source,
        notes: form.notes.trim() || null,
      }),
    onSuccess: async () => {
      setForm({
        driver_id: "",
        violation_type: "",
        occurred_at: defaultOccurredAtIso(),
        duration_minutes: "",
        source: "manual_office",
        notes: "",
      });
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) => voidHosViolation(companyId, id, reason),
    onSuccess: async () => {
      setVoidTarget(null);
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  // LIST-EMPTY: the empty message renders only after the violations query settles.
  const listState = useListState(query, (query.data?.hos_violations ?? []).length === 0);

  const columns = useMemo<Array<ParityColumn<HosViolationRow>>>(
    () => [
      { key: "driver_id", label: "Driver", sortable: true, render: (row) => String(row.driver_id ?? "—") },
      {
        key: "violation_type",
        label: "Violation Type",
        sortable: true,
        render: (row) => String(row.violation_type ?? "—"),
      },
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => String(row.occurred_at ?? "").slice(0, 16).replace("T", " "),
      },
      { key: "source", label: "Source", sortable: true, render: (row) => String(row.source ?? "—") },
      {
        key: "duration_minutes",
        label: "Duration (min)",
        render: (row) => String(row.duration_minutes ?? "—"),
      },
      { key: "csa_points", label: "CSA Pts", sortable: true, render: (row) => String(row.csa_points ?? "0") },
      {
        key: "actions",
        label: "Actions",
        render: (row) => (
          <button
            type="button"
            className="text-red-700 underline disabled:opacity-50"
            disabled={Boolean(row.voided_at) || voidMutation.isPending}
            onClick={() => setVoidTarget(row)}
          >
            {row.voided_at ? "Voided" : "Void"}
          </button>
        ),
      },
    ],
    [voidMutation.isPending],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-7">
        {/* SAF-F14: raw uuid text box replaced with the canonical driver picker (inline create). */}
        <div data-testid="hos-violation-driver-picker">
          <DriverPickerWithCreate
            operatingCompanyId={companyId}
            value={form.driver_id || null}
            onChange={(next) => setForm((v) => ({ ...v, driver_id: next ?? "" }))}
            placeholder="Search driver…"
          />
        </div>
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          placeholder="Violation type"
          value={form.violation_type}
          onChange={(e) => setForm((v) => ({ ...v, violation_type: e.target.value }))}
        />
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          type="datetime-local"
          value={toDatetimeLocalValue(form.occurred_at)}
          onChange={(e) => setForm((v) => ({ ...v, occurred_at: new Date(e.target.value).toISOString() }))}
        />
        <SelectCombobox
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          value={form.source}
          onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as Source }))}
        >
          <option value="manual_office">manual_office</option>
          <option value="samsara_auto">samsara_auto</option>
          <option value="dot_citation">dot_citation</option>
        </SelectCombobox>
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          type="number"
          min={0}
          placeholder="Duration min"
          value={form.duration_minutes}
          onChange={(e) => setForm((v) => ({ ...v, duration_minutes: e.target.value }))}
        />
        <input
          className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          placeholder="Notes"
          value={form.notes}
          onChange={(e) => setForm((v) => ({ ...v, notes: e.target.value }))}
        />
        <button
          type="button"
          className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          disabled={!form.driver_id || !form.violation_type || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          + Create
        </button>
      </div>
      {createMutation.isError ? (
        <div className="rounded-sm border border-red-300 bg-red-50 px-2 py-1.5 text-xs text-red-900" role="alert">
          {createMutation.error instanceof Error ? createMutation.error.message : "Create failed."}
        </div>
      ) : null}

      <ParityTable<HosViolationRow>
        columns={columns}
        rows={query.data?.hos_violations ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No HOS violations found."
        storageKey="safety-hos-violations"
        exportFilename="hos-violations"
      />

      <VoidReasonModal
        open={Boolean(voidTarget)}
        title="Void HOS Violation"
        entityRef={
          voidTarget
            ? `${String(voidTarget.violation_type ?? "Violation")} · driver ${String(voidTarget.driver_id ?? "—")}`
            : undefined
        }
        minLength={3}
        postsReversingEntry={false}
        onClose={() => setVoidTarget(null)}
        onSubmit={async (reason) => {
          if (!voidTarget?.id) return;
          await voidMutation.mutateAsync({ id: String(voidTarget.id), reason });
        }}
      />
    </div>
  );
}
