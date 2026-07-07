import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { createHosViolation, listHosViolations, voidHosViolation } from "../../../api/safetyV64";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { companyNow } from "../../../lib/businessDate";
import { useListState } from "../../../components/list-state";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";

type HosViolationRow = Record<string, unknown>;

export function HOSViolationsTab() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const queryClient = useQueryClient();
  const [form, setForm] = useState({
    driver_id: "",
    violation_code: "",
    violation_description: "",
    occurred_at: companyNow(),
    source: "manual" as "manual" | "eld_import" | "dot_inspection",
    duty_status: "",
    severity: "medium" as "low" | "medium" | "high" | "critical",
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
        driver_id: form.driver_id,
        violation_code: form.violation_code,
        violation_description: form.violation_description || undefined,
        occurred_at: form.occurred_at,
        source: form.source,
        duty_status: form.duty_status || undefined,
        severity: form.severity,
        notes: form.notes || undefined,
      }),
    onSuccess: async () => {
      setForm((prev) => ({ ...prev, violation_code: "", violation_description: "", notes: "" }));
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  const voidMutation = useMutation({
    mutationFn: (id: string) => voidHosViolation(companyId, id),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ["safety-v64", "hos-violations", companyId] });
    },
  });

  // LIST-EMPTY: the empty message renders only after the violations query settles.
  const listState = useListState(query, (query.data?.hos_violations ?? []).length === 0);

  const columns = useMemo<Array<ParityColumn<HosViolationRow>>>(
    () => [
      { key: "driver_id", label: "Driver", sortable: true, render: (row) => String(row.driver_id ?? "—") },
      {
        key: "violation_code",
        label: "Violation Type",
        sortable: true,
        render: (row) => String(row.violation_code ?? row.violation_type ?? "—"),
      },
      {
        key: "occurred_at",
        label: "Occurred",
        sortable: true,
        render: (row) => String(row.occurred_at ?? "").slice(0, 16).replace("T", " "),
      },
      { key: "source", label: "Source", sortable: true, render: (row) => String(row.source ?? "—") },
      {
        key: "duty_status",
        label: "Duration",
        render: (row) => String(row.duty_status ?? row.duration_minutes ?? "—"),
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
            onClick={() => voidMutation.mutate(String(row.id))}
          >
            {row.voided_at ? "Voided" : "Void"}
          </button>
        ),
      },
    ],
    [voidMutation.isPending, voidMutation.mutate],
  );

  return (
    <div className="space-y-3">
      <div className="grid gap-2 rounded-sm border border-gray-200 bg-white p-3 md:grid-cols-8">
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="driver_id" value={form.driver_id} onChange={(e) => setForm((v) => ({ ...v, driver_id: e.target.value }))} />
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Violation type" value={form.violation_code} onChange={(e) => setForm((v) => ({ ...v, violation_code: e.target.value }))} />
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Description" value={form.violation_description} onChange={(e) => setForm((v) => ({ ...v, violation_description: e.target.value }))} />
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" type="datetime-local" value={form.occurred_at.slice(0, 16)} onChange={(e) => setForm((v) => ({ ...v, occurred_at: new Date(e.target.value).toISOString() }))} />
        <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.source} onChange={(e) => setForm((v) => ({ ...v, source: e.target.value as typeof form.source }))}>
          <option value="manual">manual_office</option>
          <option value="eld_import">samsara_auto</option>
          <option value="dot_inspection">dot_citation</option>
        </SelectCombobox>
        <input className="rounded-sm border border-gray-300 px-2 py-1 text-xs" placeholder="Duration/status" value={form.duty_status} onChange={(e) => setForm((v) => ({ ...v, duty_status: e.target.value }))} />
        <SelectCombobox className="rounded-sm border border-gray-300 px-2 py-1 text-xs" value={form.severity} onChange={(e) => setForm((v) => ({ ...v, severity: e.target.value as typeof form.severity }))}>
          <option value="low">low</option>
          <option value="medium">medium</option>
          <option value="high">high</option>
          <option value="critical">critical</option>
        </SelectCombobox>
        <button
          type="button"
          className="rounded-sm bg-[#1f2a44] px-2 py-1 text-xs font-semibold text-white disabled:opacity-60"
          disabled={!form.driver_id || !form.violation_code || createMutation.isPending}
          onClick={() => createMutation.mutate()}
        >
          + Create
        </button>
      </div>

      <ParityTable<HosViolationRow>
        columns={columns}
        rows={query.data?.hos_violations ?? []}
        rowKey={(row) => String(row.id)}
        loading={listState.isLoading}
        emptyText="No HOS violations found."
        storageKey="safety-hos-violations"
        exportFilename="hos-violations"
      />
    </div>
  );
}
