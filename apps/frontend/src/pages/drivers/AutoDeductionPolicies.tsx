import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { useQueryClient } from "@tanstack/react-query";
import {
  driverDeductionTypeQueryKey,
  recoveryRailOptionsForMeta,
  useDriverDeductionTypeCatalog,
} from "../../hooks/useDriverDeductionTypeCatalog";
import { INSURANCE_CLAIM_RECOVERY_RAIL_VALUES } from "../../api/insurance";
import { Button } from "../../components/Button";
import { DriverPickerWithCreate } from "../../components/drivers/DriverPickerWithCreate";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { Modal } from "../../components/Modal";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { ListErrorState } from "../../components/ListErrorState";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { ReferenceSelect } from "../../components/parity/ReferenceSelect";
import { StatusBadge } from "../../components/StatusBadge";
import { useStagedListFilters } from "../../components/table";
import { useAutoDeductionPolicies, useAutoDeductionPolicyMutations } from "../../hooks/useAutoDeductionPolicies";

const EMPTY_FILTERS = {
  driverId: "",
};

const RAIL_LABELS: Record<string, string> = {
  escrow: "Escrow first",
  settlement: "Settlement first",
  split: "Settlement then escrow shortfall",
  ask: "Ask every time (no default)",
};

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
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5184 — visible EntityPicker reverse filter (URL-only ?driver_id= is not reverse chrome).
  // LV-DRIVERS-AUTO-DEDUCTION-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";

  function patchListSearchParam(next: { driverId: string }) {
    const p = new URLSearchParams(searchParams);
    if (next.driverId) p.set("driver_id", next.driverId);
    else p.delete("driver_id");
    setSearchParams(p, { replace: true });
  }

  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: driverIdFromUrl,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
      patchListSearchParam(next);
    },
  });
  const filterDraft = staged.draft;

  useEffect(() => {
    setApplied((prev) => ({ ...prev, driverId: driverIdFromUrl }));
  }, [driverIdFromUrl]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  const effectiveDriverId = applied.driverId.trim() || undefined;

  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to manage auto-deduction policies.</p>;
  }
  return (
    <div className="space-y-3">
      <div className="relative flex flex-wrap items-end gap-3 rounded-sm border border-gray-200 bg-white p-3" data-testid="auto-deduction-policies-filters">
        <label className="block min-w-[240px] text-xs text-slate-600">
          Driver
          <div className="mt-1">
            <EntityPicker
              kind="driver"
              operatingCompanyId={selectedCompanyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="w-full"
              dataTestId="auto-deduction-policies-filter-driver"
            />
          </div>
        </label>
        <Button type="button" size="sm" data-testid="auto-deduction-policies-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
          Apply
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="auto-deduction-policies-filter-cancel"
          onClick={staged.cancel}
          disabled={!staged.dirty}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          variant="secondary"
          data-testid="auto-deduction-policies-filter-reset"
          onClick={() => {
            staged.cancel();
            setApplied(EMPTY_FILTERS);
            patchListSearchParam(EMPTY_FILTERS);
          }}
        >
          Reset
        </Button>
      </div>
      <AutoDeductionPolicies operatingCompanyId={selectedCompanyId} driverId={effectiveDriverId} />
    </div>
  );
}

export function AutoDeductionPolicies({ operatingCompanyId, driverId: lockedDriverId }: Props) {
  const queryClient = useQueryClient();
  const policiesQuery = useAutoDeductionPolicies(operatingCompanyId, lockedDriverId);
  const { createMutation, patchMutation, cancelMutation } = useAutoDeductionPolicyMutations(operatingCompanyId);
  // SETL-PICK-01: entity-scoped catalogs.driver_deduction_types via shared hook + ReferenceSelect inline create.
  // SETL-LINK-01: consume default_recovery_rail / may_draw_escrow / survives_separation (DoD §8 ask pre-select).
  const {
    query: deductionTypesQuery,
    options: deductionTypeOptions,
    labelByCode: deductionTypeLabelByCode,
    recoveryMetaByCode,
  } = useDriverDeductionTypeCatalog({ operatingCompanyId });

  const [createOpen, setCreateOpen] = useState(false);
  const [driverId, setDriverId] = useState(lockedDriverId ?? "");
  const [deductionType, setDeductionType] = useState("");
  const [recoveryRail, setRecoveryRail] = useState<string>("ask");
  const [totalOwed, setTotalOwed] = useState("500.00");
  const [maxPerSettlement, setMaxPerSettlement] = useState("100.00");
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);

  const selectedRecoveryMeta = deductionType ? recoveryMetaByCode.get(deductionType) : undefined;
  const recoveryRailChoices = useMemo(
    () => recoveryRailOptionsForMeta(selectedRecoveryMeta),
    [selectedRecoveryMeta]
  );

  useEffect(() => {
    if (lockedDriverId) setDriverId(lockedDriverId);
  }, [lockedDriverId]);

  useEffect(() => {
    if (!deductionType && deductionTypeOptions.length > 0) {
      setDeductionType(deductionTypeOptions[0].value);
    }
  }, [deductionType, deductionTypeOptions]);

  // Pre-select catalog default when type changes; never silent — operator can still change the ask.
  useEffect(() => {
    if (!selectedRecoveryMeta) return;
    const allowed = recoveryRailOptionsForMeta(selectedRecoveryMeta);
    const preferred = selectedRecoveryMeta.default_recovery_rail;
    setRecoveryRail(allowed.includes(preferred) ? preferred : "ask");
  }, [selectedRecoveryMeta]);

  // DRV-MONEY-F7449 — React Query RETAINS the last-successful `data` across a failed refetch, so a
  // subsequent read error was previously indistinguishable from "genuinely no active policies" AND
  // left stale actionable Pause/Cancel/Resume rows rendered against data the read layer no longer
  // vouches for. Suppress rows (not just the empty-state text) whenever the read errored.
  const grouped = useMemo(() => {
    const rows = policiesQuery.isError ? [] : (policiesQuery.data?.rows ?? []);
    return {
      active: rows.filter((row) => row.status === "active"),
      paused: rows.filter((row) => row.status === "paused"),
      completed: rows.filter((row) => row.status === "completed"),
    };
  }, [policiesQuery.isError, policiesQuery.data?.rows]);

  function renderPolicyRow(row: (typeof grouped.active)[number]) {
    const owed = Number(row.total_owed_cents ?? 0);
    const deducted = Number(row.deducted_so_far_cents ?? 0);
    const pct = owed > 0 ? Math.min(100, Math.round((deducted / owed) * 100)) : 0;
    const typeLabel = deductionTypeLabelByCode.get(row.deduction_type) ?? row.deduction_type;
    const rail = row.default_recovery_rail ?? recoveryMetaByCode.get(row.deduction_type)?.default_recovery_rail;
    const mayEscrow = row.may_draw_escrow ?? recoveryMetaByCode.get(row.deduction_type)?.may_draw_escrow;
    return (
      <div key={row.id} className="rounded-sm border border-gray-200 bg-white p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <div className="text-sm font-semibold text-gray-900">
              <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
            </div>
            <div className="text-xs text-gray-600">{typeLabel} · {money(deducted)} / {money(owed)}</div>
            {rail ? (
              <div className="mt-0.5 text-[11px] text-slate-600" data-testid="auto-deduction-policy-recovery-meta">
                Recovery: {RAIL_LABELS[rail] ?? rail}
                {mayEscrow ? " · may draw escrow" : " · escrow blocked"}
              </div>
            ) : null}
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

      {policiesQuery.isError ? (
        <ListErrorState
          title="Couldn't load auto-deduction policies"
          status={0}
          message={(policiesQuery.error as Error)?.message}
          onRetry={() => void policiesQuery.refetch()}
        />
      ) : (
        <>
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
        </>
      )}

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
              const railNote = `recovery_rail=${recoveryRail}`;
              const memoWithRail = memo.trim() ? `${memo.trim()} · ${railNote}` : railNote;
              await createMutation.mutateAsync({
                driver_id: driverId,
                deduction_type: deductionType,
                total_owed_cents: totalCents,
                max_per_settlement_cents: maxCents,
                memo: memoWithRail,
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
                driverRoster="active_or_probation"
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
                  queryKey: driverDeductionTypeQueryKey(operatingCompanyId),
                });
              }}
            />
            {deductionTypesQuery.isError ? (
              <span className="text-[10px] font-normal text-red-600">Could not load deduction types from catalog.</span>
            ) : null}
          </label>
          {/*
            SETL-LINK-01: catalog default_recovery_rail pre-selects the mandatory ask (DoD §8).
            Options exclude escrow/split when may_draw_escrow=false (coherence CHECK).
          */}
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600" data-testid="auto-deduction-recovery-rail-field">
            Recovery rail (always ask)
            <select
              className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              value={recoveryRail}
              onChange={(e) => setRecoveryRail(e.target.value)}
              disabled={!deductionType}
            >
              {(recoveryRailChoices.length ? recoveryRailChoices : [...INSURANCE_CLAIM_RECOVERY_RAIL_VALUES]).map((rail) => (
                <option key={rail} value={rail}>
                  {RAIL_LABELS[rail] ?? rail}
                </option>
              ))}
            </select>
            {selectedRecoveryMeta ? (
              <span className="text-[10px] font-normal text-slate-600" data-testid="auto-deduction-catalog-recovery-meta">
                Catalog default: {RAIL_LABELS[selectedRecoveryMeta.default_recovery_rail] ?? selectedRecoveryMeta.default_recovery_rail}
                {" · "}
                {selectedRecoveryMeta.may_draw_escrow ? "may draw escrow" : "escrow blocked"}
                {" · "}
                {selectedRecoveryMeta.survives_separation ? "survives separation" : "ends at separation"}
              </span>
            ) : (
              <span className="text-[10px] font-normal text-slate-500">Select a type to load catalog recovery policy.</span>
            )}
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
