import { useMemo, useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forfeitEscrow, listEscrowRecords, type EscrowRecordRow } from "../../../api/driverFinance";
import { useAuth } from "../../../auth/useAuth";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EscrowForfeitModal } from "../components/EscrowForfeitModal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityPicker } from "../../../components/parity/EntityPicker";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";
import { Button } from "../../../components/Button";
import { useStagedListFilters } from "../../../components/table";

const EMPTY_FILTERS = { driverId: "" };

export function EscrowRecordTab() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";
  const [selected, setSelected] = useState<EscrowRecordRow | null>(null);

  // SAFETY-MONEY-F6635-ESCROW-FORFEIT-MUTABLE-COMPANY-RECORD-SCOPE — forfeitMutation passed the
  // cloned row/amount/reason/liability as its variables but closed over the LIVE (mutable)
  // operatingCompanyId inside mutationFn/onSuccess, and onSuccess unconditionally cleared the
  // current modal selection. A selected-company transition during this liability-bearing
  // request could submit the old escrow row under the NEW company, or disclose/clear completion
  // in whatever company happens to be visible when the response lands. Same scope-generation-
  // snapshot idiom already shipped for UnitPermitsTab.tsx / PaymentScheduleTab.tsx /
  // WOTimeTrackingPanel.tsx.
  const scopeGenerationRef = useRef(0);
  useEffect(() => {
    scopeGenerationRef.current += 1;
  }, [operatingCompanyId]);
  const [searchParams, setSearchParams] = useSearchParams();
  const escrowDriverIdParam = searchParams.get("driver_id")?.trim() ?? "";
  // LST-F5163K: visible reverse filter (allowCreate=false); URL seeds picker + opens matching row.
  // LV-SAFETY-ESCROW-RECORD-FILTER-SILENT-APPLY — stage until Apply; Cancel restores.
  // Do not write driver_id on Apply: SAF-B30 deep-link consumes ?driver_id= to open the forfeit
  // modal then clears it — rewriting the same param on filter Apply would re-open the modal.
  const [applied, setApplied] = useState(() => ({
    ...EMPTY_FILTERS,
    driverId: escrowDriverIdParam,
  }));
  const staged = useStagedListFilters({
    applied,
    empty: EMPTY_FILTERS,
    onApply: (next) => {
      setApplied(next);
    },
  });
  const draft = staged.draft;

  useEffect(() => {
    if (escrowDriverIdParam) {
      setApplied((prev) => ({ ...prev, driverId: escrowDriverIdParam }));
    }
  }, [escrowDriverIdParam]);

  function setDriverFilter(next: string) {
    staged.setDraft((d) => ({ ...d, driverId: next }));
  }

  const escrowQuery = useQuery({
    queryKey: ["safety", "escrow-records", operatingCompanyId],
    queryFn: () => listEscrowRecords(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const forfeitMutation = useMutation({
    mutationFn: (payload: {
      row: EscrowRecordRow;
      operatingCompanyId: string;
      generation: number;
      amount: number;
      reason_code: string;
      reason_note?: string;
      linked_liability_id?: string;
    }) =>
      forfeitEscrow(payload.row.id, {
        operating_company_id: payload.operatingCompanyId,
        amount: payload.amount,
        reason_code: payload.reason_code,
        reason_note: payload.reason_note,
        linked_liability_id: payload.linked_liability_id,
      }),
    onSuccess: (result, payload) => {
      if (payload.generation !== scopeGenerationRef.current) return;
      pushToast(
        result.status === "blocked" ? "Forfeiture blocked by agreement gate." : "Escrow forfeiture submitted.",
        result.status === "blocked" ? "error" : "success"
      );
      void queryClient.invalidateQueries({ queryKey: ["safety", "escrow-records", payload.operatingCompanyId] });
      setSelected(null);
    },
    onError: (_error, payload) => {
      if (payload.generation !== scopeGenerationRef.current) return;
      pushToast("Forfeiture request failed.", "error");
    },
  });
  const resetForfeitMutation = forfeitMutation.reset;

  useEffect(() => {
    resetForfeitMutation();
    setSelected(null);
  }, [operatingCompanyId, resetForfeitMutation]);

  const rowsAll = escrowQuery.data?.records ?? [];
  const effectiveDriverId = applied.driverId.trim() || escrowDriverIdParam || "";
  const rows = useMemo(() => {
    if (!effectiveDriverId) return rowsAll;
    return rowsAll.filter(
      (r) => String((r as { driver_id?: unknown }).driver_id ?? r.id) === effectiveDriverId
    );
  }, [rowsAll, effectiveDriverId]);

  // SAF-B30: EntityLink kind "escrow_record" routes here with ?driver_id=<id> and nothing read it,
  // so the escrow drill-through was a facade. Opens that driver's record once the list has loaded.
  useEffect(() => {
    if (!escrowDriverIdParam || rowsAll.length === 0) return;
    const match = rowsAll.find(
      (r) => String((r as { driver_id?: unknown }).driver_id ?? r.id) === escrowDriverIdParam
    );
    if (match) {
      setSelected(match);
      const next = new URLSearchParams(searchParams);
      next.delete("driver_id");
      setSearchParams(next, { replace: true });
    }
  }, [escrowDriverIdParam, rowsAll, searchParams, setSearchParams]);
  const attempts = escrowQuery.data?.forfeit_attempts ?? [];
  // SAF-ORPH-03: surface per-driver timeline failures — silent catch left the Forfeiture Audit empty forever.
  const timelineErrors = escrowQuery.data?.timeline_errors ?? [];
  const totalForfeits = useMemo(() => attempts.filter((a) => a.status === "success").length, [attempts]);
  // SAF-B08: has_signed_clause is server-derived from legal.contract_instances — surface it so
  // operators see WHY Forfeit is blocked. Do not invent a signed row; count is from live records.
  const signedClauseCount = useMemo(() => rows.filter((r) => r.has_signed_clause).length, [rows]);

  const columns = useMemo<ParityColumn<EscrowRecordRow>[]>(
    () => [
      {
        // SAF-F23: the driver was plain text on a money screen — no way to get from a driver's
        // escrow balance back to the driver. `row.id` IS the mdata.drivers id (listEscrowRecords
        // builds each record with `id: driverId`), so this is a canonical FK drill-through, not a
        // label. The driver page carries the settlement/earnings + escrow history surfaces.
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.id || null}
            label={entityLabel(row.driver_name, row.id, "Driver")}
            className="font-semibold text-slate-700"
            data-testid={`escrow-driver-link-${row.id}`}
          />
        ),
      },
      { key: "current_balance", label: "Current Balance", sortable: true, render: (row) => `$${row.current_balance.toFixed(2)}` },
      { key: "pre_clause_total", label: "Pre-clause", sortable: true, render: (row) => `$${row.pre_clause_total.toFixed(2)}` },
      { key: "post_clause_total", label: "Post-clause", sortable: true, render: (row) => `$${row.post_clause_total.toFixed(2)}` },
      {
        key: "has_signed_clause",
        label: "Signed clause",
        sortable: true,
        render: (row) => (
          <span
            data-testid={`escrow-signed-clause-${row.id}`}
            className={row.has_signed_clause ? "font-semibold text-slate-700" : "text-slate-400"}
          >
            {row.has_signed_clause ? "On file" : "Missing"}
          </span>
        ),
      },
      {
        // SAF-F09: NULL means no escrow target is configured for this entity/driver. It renders as
        // "Not configured", never as 0% or a number computed against an invented denominator — a
        // fabricated percentage on a forfeiture screen is worse than an honest blank.
        key: "accumulation_rate_pct",
        label: "Accumulation Rate",
        sortable: true,
        render: (row) =>
          row.accumulation_rate_pct == null ? (
            <span className="text-slate-400">Not configured</span>
          ) : (
            `${row.accumulation_rate_pct.toFixed(2)}%`
          ),
      },
      { key: "forfeiture_history_count", label: "Forfeiture History", sortable: true },
      {
        key: "action",
        label: "Actions",
        render: (row) =>
          isOwner ? (
            <button
              type="button"
              className="text-[#1f2a44] underline"
              data-testid={`escrow-forfeit-btn-${row.id}`}
              onClick={() => setSelected(row)}
            >
              Forfeit
            </button>
          ) : (
            <span className="text-slate-400">Owner-only</span>
          ),
      },
    ],
    [isOwner],
  );

  return (
    <div className="space-y-3" data-testid="escrow-record-tab">
      <div className="rounded-sm border border-gray-200 bg-white p-3 text-xs text-slate-600">
        Escrow balances and events surface security-invoker data. Forfeiture attempts are auditable.
        {rows.length > 0 ? (
          <p className="mt-1 text-[11px] text-slate-500" data-testid="escrow-signed-clause-summary">
            Signed escrow clause on file: {signedClauseCount} of {rows.length} drivers, based on signed contract records.
            Forfeit stays blocked until the clause is signed.
          </p>
        ) : null}
      </div>

      {escrowQuery.isError ? (
        <div className="rounded-sm border border-red-200 bg-red-50 p-3 text-xs text-red-700">Unable to load escrow records.</div>
      ) : null}

      <ParityTable<EscrowRecordRow>
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={escrowQuery.isLoading}
        emptyText="No escrow records available for the selected company."
        storageKey="safety-escrow-records"
        exportFilename="escrow-records"
        tableTestId="escrow-record-table"
        rowTestId={(row) => `escrow-record-row-${row.id}`}
        filterBar={
          <div className="relative flex flex-wrap items-end gap-2" data-testid="escrow-records-filters">
            <label className="text-[11px] text-slate-600">
              Driver
              <EntityPicker
                kind="driver"
                operatingCompanyId={operatingCompanyId}
                value={draft.driverId || null}
                onChange={(next) => setDriverFilter(next ?? "")}
                allowCreate={false}
                placeholder="All drivers"
                className="mt-1"
                dataTestId="escrow-records-filter-driver"
              />
            </label>
            <Button type="button" size="sm" data-testid="escrow-records-filter-apply" onClick={staged.apply} disabled={!staged.dirty}>
              Apply
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="escrow-records-filter-cancel"
              onClick={staged.cancel}
              disabled={!staged.dirty}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              data-testid="escrow-records-filter-reset"
              onClick={() => {
                staged.cancel();
                setApplied(EMPTY_FILTERS);
              }}
            >
              Reset
            </Button>
          </div>
        }
      />

      {timelineErrors.length > 0 ? (
        <div
          className="rounded-sm border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900"
          data-testid="escrow-forfeit-audit-errors"
        >
          Escrow timeline unavailable for {timelineErrors.length} driver
          {timelineErrors.length === 1 ? "" : "s"} — forfeiture audit below may be incomplete.
          <ul className="mt-1 list-disc pl-4 text-[11px]">
            {timelineErrors.slice(0, 3).map((entry) => (
              <li key={entry}>{entry}</li>
            ))}
            {timelineErrors.length > 3 ? <li>…and {timelineErrors.length - 3} more</li> : null}
          </ul>
        </div>
      ) : null}

      <div className="rounded-sm border border-gray-200 bg-white p-3" data-testid="escrow-forfeit-audit">
        <h4 className="text-xs font-semibold text-slate-700">Forfeiture Audit</h4>
        <p className="mt-1 text-[11px] text-slate-500">Successful forfeitures: {totalForfeits}</p>
        <div className="mt-2 space-y-1 text-[11px]">
          {attempts.map((entry) => (
            <div key={entry.id} className={entry.status === "blocked" ? "text-red-700" : "text-slate-700"}>
              {entry.created_at.slice(0, 16).replace("T", " ")} - <EntityLink kind="driver" id={entry.driver_id} label={entityLabel(entry.driver_name, entry.driver_id, "Driver")} /> - ${entry.amount.toFixed(2)} - {entry.reason} (
              {entry.status})
              {/* LIABILITY column-wave: linked_liability_id already flows end-to-end
                  (escrow-forfeit.service.ts writes it → timelineToAttempts reads it into
                  EscrowForfeitAttempt) — this render was the only missing link in the whole chain. */}
              {entry.linked_liability_id ? (
                <>
                  {" "}- <EntityLink kind="liability" id={entry.linked_liability_id} label="Liability" />
                </>
              ) : null}
            </div>
          ))}
          {attempts.length === 0 ? <div className="text-slate-400">No forfeiture attempts yet.</div> : null}
        </div>
      </div>

      {/* ARCHIVE-not-DELETE: legacy inline forfeit modal replaced by EscrowForfeitModal (A23-8). Sunset: Phase 4 driver-finance escrow API parity. */}
      <EscrowForfeitModal
        open={Boolean(selected)}
        row={selected}
        operatingCompanyId={operatingCompanyId}
        loading={forfeitMutation.isPending}
        onClose={() => setSelected(null)}
        onConfirm={(payload) => {
          if (!selected) return;
          forfeitMutation.mutate({ row: selected, operatingCompanyId, generation: scopeGenerationRef.current, ...payload });
        }}
      />
    </div>
  );
}
