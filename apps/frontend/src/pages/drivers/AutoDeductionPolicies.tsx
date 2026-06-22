import { useMemo, useState } from "react";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { listDrivers } from "../../api/mdata";
import { useQuery } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { Modal } from "../../components/Modal";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { StatusBadge } from "../../components/StatusBadge";
import { useAutoDeductionPolicies, useAutoDeductionPolicyMutations } from "../../hooks/useAutoDeductionPolicies";

type Props = {
  operatingCompanyId: string;
};

const DEDUCTION_TYPES = [
  { value: "damage", label: "Damage" },
  { value: "cash_advance", label: "Cash advance" },
  { value: "repair", label: "Repair" },
  { value: "fine", label: "Fine" },
  { value: "fuel_advance", label: "Fuel advance" },
  { value: "other", label: "Other" },
] as const;

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function AutoDeductionPoliciesPanel() {
  const { selectedCompanyId } = useCompanyContext();
  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to manage auto-deduction policies.</p>;
  }
  return <AutoDeductionPolicies operatingCompanyId={selectedCompanyId} />;
}

export function AutoDeductionPolicies({ operatingCompanyId }: Props) {
  const policiesQuery = useAutoDeductionPolicies(operatingCompanyId);
  const { createMutation, patchMutation, cancelMutation } = useAutoDeductionPolicyMutations(operatingCompanyId);
  const driversQuery = useQuery({
    queryKey: ["drivers", "auto-deductions", operatingCompanyId],
    queryFn: () => listDrivers({ operating_company_id: operatingCompanyId }).then((res) => res.drivers),
    enabled: Boolean(operatingCompanyId),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [driverId, setDriverId] = useState("");
  const [deductionType, setDeductionType] = useState<(typeof DEDUCTION_TYPES)[number]["value"]>("repair");
  const [totalOwed, setTotalOwed] = useState("500.00");
  const [maxPerSettlement, setMaxPerSettlement] = useState("100.00");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const grouped = useMemo(() => {
    const rows = policiesQuery.data?.rows ?? [];
    return {
      active: rows.filter((row) => row.status === "active"),
      paused: rows.filter((row) => row.status === "paused"),
      completed: rows.filter((row) => row.status === "completed"),
    };
  }, [policiesQuery.data?.rows]);

  const driverNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const driver of driversQuery.data ?? []) {
      map.set(driver.id, `${driver.first_name} ${driver.last_name}`);
    }
    return map;
  }, [driversQuery.data]);

  function renderPolicyRow(row: (typeof grouped.active)[number]) {
    const owed = Number(row.total_owed_cents ?? 0);
    const deducted = Number(row.deducted_so_far_cents ?? 0);
    const pct = owed > 0 ? Math.min(100, Math.round((deducted / owed) * 100)) : 0;
    return (
      <div key={row.id} className="rounded border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">{driverNameById.get(row.driver_id) || row.driver_id}</div>
            <div className="text-xs text-gray-600">{row.deduction_type} · {money(deducted)} / {money(owed)}</div>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2 h-2 rounded bg-gray-100">
          <div className="h-2 rounded bg-[#1F2A44]" style={{ width: `${pct}%` }} />
        </div>
        {row.memo ? <p className="mt-2 text-xs text-gray-600">{row.memo}</p> : null}
        <div className="mt-2 flex flex-wrap gap-2">
          {row.status === "active" ? (
            <>
              <Button size="sm" variant="secondary" onClick={() => void patchMutation.mutateAsync({ id: row.id, body: { status: "paused" } })}>
                Pause
              </Button>
              <Button size="sm" variant="secondary" onClick={() => void cancelMutation.mutateAsync(row.id)}>
                Cancel
              </Button>
            </>
          ) : null}
          {row.status === "paused" ? (
            <Button size="sm" variant="secondary" onClick={() => void patchMutation.mutateAsync({ id: row.id, body: { status: "active" } })}>
              Resume
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button size="sm" onClick={() => setCreateOpen(true)}>
          Create policy
        </Button>
      </div>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Active</h3>
        {grouped.active.map(renderPolicyRow)}
        {grouped.active.length === 0 ? <p className="text-xs text-gray-500">No active auto-deduction policies.</p> : null}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Paused</h3>
        {grouped.paused.map(renderPolicyRow)}
      </section>

      <section className="space-y-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-gray-600">Completed</h3>
        {grouped.completed.map(renderPolicyRow)}
      </section>

      <Modal open={createOpen} onClose={() => setCreateOpen(false)} title="Create auto-deduction policy">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (!driverId) {
              setError("Select a driver.");
              return;
            }
            const totalCents = Math.round(Number(totalOwed) * 100);
            const maxCents = Math.round(Number(maxPerSettlement) * 100);
            if (totalCents <= 0 || maxCents <= 0) {
              setError("Amounts must be greater than zero.");
              return;
            }
            try {
              await createMutation.mutateAsync({
                driver_id: driverId,
                deduction_type: deductionType,
                total_owed_cents: totalCents,
                max_per_settlement_cents: maxCents,
                memo: memo || undefined,
              });
              setCreateOpen(false);
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : "Create failed.");
            }
          }}
        >
          {error ? <div className="rounded border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Driver
            <SelectCombobox className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={driverId} onChange={(e) => setDriverId(e.target.value)}>
              <option value="">Select driver…</option>
              {(driversQuery.data ?? []).map((driver) => (
                <option key={driver.id} value={driver.id}>
                  {driver.first_name} {driver.last_name}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Type
            <SelectCombobox className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={deductionType} onChange={(e) => setDeductionType(e.target.value as typeof deductionType)}>
              {DEDUCTION_TYPES.map((type) => (
                <option key={type.value} value={type.value}>
                  {type.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Total owed (USD)
              <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={totalOwed} onChange={(e) => setTotalOwed(e.target.value)} />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Max / settlement (USD)
              <input className="h-9 rounded border border-gray-300 px-2 text-[13px]" value={maxPerSettlement} onChange={(e) => setMaxPerSettlement(e.target.value)} />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Memo
            <textarea rows={2} className="rounded border border-gray-300 px-2 py-1.5 text-[13px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
