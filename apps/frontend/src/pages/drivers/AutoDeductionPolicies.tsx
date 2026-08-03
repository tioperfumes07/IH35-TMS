import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { driverDeductionTypesCatalogClient } from "../../api/catalogs-driver";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Modal } from "../../components/Modal";
import { EntityLink } from "../../components/shared/EntityLink";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { StatusBadge } from "../../components/StatusBadge";
import { useAutoDeductionPolicies, useAutoDeductionPolicyMutations } from "../../hooks/useAutoDeductionPolicies";

type Props = {
  operatingCompanyId: string;
  /**
   * LAW OF THE LAND §9 (2026-07-22): reverse link from DriverDetail.tsx / EarningsTab.tsx
   * (?driver_id= on /drivers/deductions). Scopes the list and locks the create form's driver field.
   */
  driverId?: string;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function AutoDeductionPoliciesPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams] = useSearchParams();
  const driverIdFilter = searchParams.get("driver_id") ?? undefined;
  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to manage auto-deduction policies.</p>;
  }
  return <AutoDeductionPolicies operatingCompanyId={selectedCompanyId} driverId={driverIdFilter} />;
}

export function AutoDeductionPolicies({ operatingCompanyId, driverId: lockedDriverId }: Props) {
  const queryClient = useQueryClient();
  const policiesQuery = useAutoDeductionPolicies(operatingCompanyId, lockedDriverId);
  const { createMutation, patchMutation, cancelMutation } = useAutoDeductionPolicyMutations(operatingCompanyId);
  // LST-PICKER-01: catalog read already entity-scoped (SETL-PICK-01); Type must inline-create same table.
  const deductionTypesQuery = useQuery({
    queryKey: ["catalogs", "driver-deduction-types", operatingCompanyId],
    queryFn: () =>
      driverDeductionTypesCatalogClient.list({
        operating_company_id: operatingCompanyId,
        is_active: "true",
        limit: 200,
      }),
    enabled: Boolean(operatingCompanyId),
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [driverId, setDriverId] = useState(lockedDriverId ?? "");
  const [deductionType, setDeductionType] = useState("");
  const [totalOwed, setTotalOwed] = useState("500.00");
  const [maxPerSettlement, setMaxPerSettlement] = useState("100.00");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const deductionTypeOptions = useMemo(
    () =>
      (deductionTypesQuery.data?.rows ?? []).map((row) => ({
        value: row.code,
        label: row.display_name,
      })),
    [deductionTypesQuery.data]
  );

  const deductionTypeLabelByCode = useMemo(() => {
    const map = new Map<string, string>();
    for (const row of deductionTypesQuery.data?.rows ?? []) {
      map.set(row.code, row.display_name);
    }
    return map;
  }, [deductionTypesQuery.data]);

  useEffect(() => {
    if (lockedDriverId) setDriverId(lockedDriverId);
  }, [lockedDriverId]);

  useEffect(() => {
    if (!deductionType && deductionTypeOptions.length > 0) {
      setDeductionType(deductionTypeOptions[0].value);
    }
  }, [deductionType, deductionTypeOptions]);

  const grouped = useMemo(() => {
    const rows = policiesQuery.data?.rows ?? [];
    return {
      active: rows.filter((row) => row.status === "active"),
      paused: rows.filter((row) => row.status === "paused"),
      completed: rows.filter((row) => row.status === "completed"),
    };
  }, [policiesQuery.data?.rows]);

  function renderPolicyRow(row: (typeof grouped.active)[number]) {
    const owed = Number(row.total_owed_cents ?? 0);
    const deducted = Number(row.deducted_so_far_cents ?? 0);
    const pct = owed > 0 ? Math.min(100, Math.round((deducted / owed) * 100)) : 0;
    const typeLabel = deductionTypeLabelByCode.get(row.deduction_type) ?? row.deduction_type;
    return (
      <div key={row.id} className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              <EntityLink kind="driver" id={row.driver_id} />
            </div>
            <div className="text-xs text-gray-600">{typeLabel} · {money(deducted)} / {money(owed)}</div>
          </div>
          <StatusBadge status={row.status} />
        </div>
        <div className="mt-2 h-2 rounded-sm bg-gray-100">
          <div className="h-2 rounded-sm bg-[#1F2A44]" style={{ width: `${pct}%` }} />
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

      <Modal variant="drawer" open={createOpen} onClose={() => setCreateOpen(false)} title="Create auto-deduction policy">
        <form
          className="space-y-3"
          onSubmit={async (event) => {
            event.preventDefault();
            setError(null);
            if (!driverId) {
              setError("Select a driver.");
              return;
            }
            if (!deductionType) {
              setError("Select a deduction type.");
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
          {error ? <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div> : null}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Driver
            <div className="mt-1">
              <DriverPickerWithCreate
                operatingCompanyId={operatingCompanyId}
                value={driverId || null}
                onChange={(next) => setDriverId(next ?? "")}
                open={createOpen}
                disabled={Boolean(lockedDriverId)}
                placeholder="Select driver…"
                dataField="auto-deduction-driver"
              />
            </div>
            {lockedDriverId ? (
              <span className="text-[10px] font-normal text-gray-500">Locked from driver profile.</span>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Type
            {/*
              LST-PICKER-01: bare SelectCombobox forced Lists-only create. ReferenceSelect
              createKind=driver_deduction_type → POST catalogs.driver_deduction_types (code FK).
            */}
            <ReferenceSelect
              value={deductionType || null}
              onChange={(next) => setDeductionType(next ?? "")}
              options={deductionTypeOptions}
              createKind="driver_deduction_type"
              operatingCompanyId={operatingCompanyId}
              createdValueField="code"
              placeholder={
                deductionTypesQuery.isLoading
                  ? "Loading deduction types…"
                  : deductionTypeOptions.length === 0
                    ? "No deduction types yet — + Add new below"
                    : "Select deduction type…"
              }
              loading={deductionTypesQuery.isLoading}
              disabled={!operatingCompanyId || deductionTypesQuery.isLoading}
              onOptionCreated={() => {
                void queryClient.invalidateQueries({
                  queryKey: ["catalogs", "driver-deduction-types", operatingCompanyId],
                });
              }}
            />
            {deductionTypesQuery.isError ? (
              <span className="text-[10px] font-normal text-red-600">Could not load deduction types from catalog.</span>
            ) : null}
          </label>
          <div className="grid grid-cols-2 gap-2">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Total owed (USD)
              {/* M-1: dollars-mode; Math.round(totalOwed*100)=total_owed_cents byte-for-byte. */}
              <MoneyInput valueDollars={totalOwed ? Number(totalOwed) : null} onChangeDollars={(d) => setTotalOwed(d == null ? "" : String(d))} ariaLabel="Total owed (USD)" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Max / settlement (USD)
              <MoneyInput valueDollars={maxPerSettlement ? Number(maxPerSettlement) : null} onChangeDollars={(d) => setMaxPerSettlement(d == null ? "" : String(d))} ariaLabel="Max / settlement (USD)" />
            </label>
          </div>
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Memo
            <textarea rows={2} className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]" value={memo} onChange={(e) => setMemo(e.target.value)} />
          </label>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={createMutation.isPending || !deductionType}>
              Create
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
