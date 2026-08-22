import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useSearchParams } from "react-router-dom";
import { listSettlementDeductions } from "../../api/driverFinance";
import { Button } from "../../components/Button";
import { DataPanel } from "../../components/layout/DataPanel";
import { DataPanelRow } from "../../components/layout/DataPanelRow";
import { EntityPicker } from "../../components/parity/EntityPicker";
import { EntityLink } from "../../components/shared/EntityLink";
import { StatusBadge } from "../../components/StatusBadge";
import { useStagedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { colors } from "../../design/tokens";
import { formatUsdCents } from "../../lib/money";
import { entityLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../../components/CappedListNotice";

const EMPTY_FILTERS = { driverId: "" };

/**
 * FAIL-DD2 — pending rows from driver_finance.driver_settlement_deductions.
 * Auto-deduction policies are a different table; without this panel a $100 cash-advance
 * recovery stays invisible on /drivers/deductions while the ledger row is correct.
 *
 * LST-F5163M: CappedListNotice already told operators to "narrow with the driver filter"
 * while the only filter was a silent ?driver_id= URL — visible EntityPicker closes that gap.
 * LV-DRIVERS-PENDING-DEDUCTIONS-FILTER-SILENT-APPLY — stage until Apply; URL on Apply/Reset.
 */
export function PendingSettlementDeductionsPanel() {
  const { selectedCompanyId } = useCompanyContext();
  const [searchParams, setSearchParams] = useSearchParams();
  // LST-F5187 — EntityPicker must write ?driver_id= (not local-only filter state).
  const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
  const requestedDeductionId = searchParams.get("deduction_id")?.trim() ?? "";

  function patchSearchParam(next: { driverId: string }) {
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
      patchSearchParam(next);
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

  const query = useQuery({
    queryKey: ["driver-finance", "settlement-deductions", selectedCompanyId, effectiveDriverId, requestedDeductionId],
    queryFn: () =>
      listSettlementDeductions(selectedCompanyId!, {
        driver_id: effectiveDriverId,
        deduction_id: requestedDeductionId || undefined,
        // Open recoveries only — applied/voided stay out of the working queue.
        status: requestedDeductionId ? undefined : "pending",
        limit: 200,
      }),
    enabled: Boolean(selectedCompanyId),
  });

  const rows = query.data?.deductions ?? [];

  if (!selectedCompanyId) {
    return <p className="px-2 py-2 text-xs text-gray-500">Select an operating company to view pending deductions.</p>;
  }

  return (
    <div data-testid="drivers-pending-settlement-deductions">
      <DataPanel title="Pending settlement deductions" accentColor={colors.crit.strong}>
        <div className="relative mb-2 flex flex-wrap items-end gap-2 px-2" data-testid="settlement-deductions-filters">
          <label className="text-[11px] text-slate-600">
            Driver
            <EntityPicker
              kind="driver"
              operatingCompanyId={selectedCompanyId}
              value={filterDraft.driverId || null}
              onChange={(next) => setDriverFilter(next ?? "")}
              allowCreate={false}
              placeholder="All drivers"
              className="mt-1"
              dataTestId="settlement-deductions-filter-driver"
            />
          </label>
          <Button type="button" size="sm" data-testid="settlement-deductions-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
            Apply
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="settlement-deductions-filter-cancel"
            onClick={staged.cancel}
            disabled={!staged.dirty}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            variant="secondary"
            data-testid="settlement-deductions-filter-reset"
            onClick={() => {
              staged.cancel();
              setApplied(EMPTY_FILTERS);
              patchSearchParam(EMPTY_FILTERS);
            }}
          >
            Reset
          </Button>
        </div>
        {query.isLoading ? <p className="px-2 py-2 text-xs text-gray-500">Loading…</p> : null}
        {query.isError ? (
          <p className="px-2 py-2 text-xs text-red-700">Could not load pending deductions.</p>
        ) : null}
        {!query.isLoading && !query.isError && rows.length === 0 ? (
          <p className="px-2 py-2 text-xs text-gray-500">No pending settlement deductions.</p>
        ) : null}
        {rows.map((row) => (
          <DataPanelRow key={row.id}>
            <span className="min-w-0">
              <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />
              {" · "}
              <span className="text-slate-700">{row.reason?.trim() || row.deduction_type}</span>{" "}
              <StatusBadge status={row.status} />
            </span>
            <span className="shrink-0 font-semibold text-red-700">
              {formatUsdCents(row.remaining_balance_cents ?? row.amount_cents)}
            </span>
          </DataPanelRow>
        ))}
        <CappedListNotice
          shown={rows.length}
          limit={200}
          hint="This queue shows pending recoveries only — narrow with the driver filter if the list is truncated."
          className="px-2 py-1 text-xs text-slate-600"
        />
      </DataPanel>
    </div>
  );
}
