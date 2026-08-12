import { useMemo, useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { forfeitEscrow, listEscrowRecords, type EscrowRecordRow } from "../../../api/driverFinance";
import { useAuth } from "../../../auth/useAuth";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { EscrowForfeitModal } from "../components/EscrowForfeitModal";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { EntityLink } from "../../../components/shared/EntityLink";
import { entityLabel } from "../../../lib/entity-label";

export function EscrowRecordTab() {
  const auth = useAuth();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const operatingCompanyId = selectedCompanyId ?? "";
  const isOwner = auth.user?.role === "Owner";
  const [selected, setSelected] = useState<EscrowRecordRow | null>(null);

  const escrowQuery = useQuery({
    queryKey: ["safety", "escrow-records", operatingCompanyId],
    queryFn: () => listEscrowRecords(operatingCompanyId),
    enabled: Boolean(operatingCompanyId),
  });

  const forfeitMutation = useMutation({
    mutationFn: (payload: {
      row: EscrowRecordRow;
      amount: number;
      reason_code: string;
      reason_note?: string;
      linked_liability_id?: string;
    }) =>
      forfeitEscrow(payload.row.id, {
        operating_company_id: operatingCompanyId,
        amount: payload.amount,
        reason_code: payload.reason_code,
        reason_note: payload.reason_note,
        linked_liability_id: payload.linked_liability_id,
      }),
    onSuccess: (result) => {
      pushToast(
        result.status === "blocked" ? "Forfeiture blocked by agreement gate." : "Escrow forfeiture submitted.",
        result.status === "blocked" ? "error" : "success"
      );
      void queryClient.invalidateQueries({ queryKey: ["safety", "escrow-records", operatingCompanyId] });
      setSelected(null);
    },
    onError: () => {
      pushToast("Forfeiture request failed.", "error");
    },
  });

  const rows = escrowQuery.data?.records ?? [];

  // SAF-B30: EntityLink kind "escrow_record" routes here with ?driver_id=<id> and nothing read it,
  // so the escrow drill-through was a facade. Opens that driver's record once the list has loaded.
  const [searchParams, setSearchParams] = useSearchParams();
  const escrowDriverIdParam = searchParams.get("driver_id");
  useEffect(() => {
    if (!escrowDriverIdParam || rows.length === 0) return;
    const match = rows.find(
      (r) => String((r as { driver_id?: unknown }).driver_id ?? r.id) === escrowDriverIdParam
    );
    if (match) {
      setSelected(match);
      const next = new URLSearchParams(searchParams);
      next.delete("driver_id");
      setSearchParams(next, { replace: true });
    }
  }, [escrowDriverIdParam, rows, searchParams, setSearchParams]);
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
            Signed escrow clause on file: {signedClauseCount} of {rows.length} drivers (from{" "}
            <code className="text-[10px]">legal.contract_instances</code>
            ). Forfeit stays blocked until the clause is signed.
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
          forfeitMutation.mutate({ row: selected, ...payload });
        }}
      />
    </div>
  );
}
