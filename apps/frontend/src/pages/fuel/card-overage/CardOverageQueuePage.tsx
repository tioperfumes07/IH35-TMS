import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListErrorState } from "../../../components/ListErrorState";
import { ConfirmModal } from "../../../components/shared/ConfirmModal";
import { EntityPicker } from "../../../components/EntityPicker";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";
import { CollapsedListFilters, useStagedListFilters } from "../../../components/table";
import { ExemptOverageModal, type ExemptOverageInput } from "./ExemptOverageModal";

/**
 * BANK-F10 / FUEL-03 — operator queue for fuel-card overage approve-then-recover.
 * Backend routes already on main; this mounts the reachable UI (DOD-A / VERIFY-1).
 * Does NOT flip BANK-F10 PASS — flags default OFF; Neon events=0 until engine enabled.
 */

export type OverageEventRow = {
  id: string;
  fuel_transaction_id: string;
  driver_id: string | null;
  driver_name: string;
  unit_id: string | null;
  unit_number: string | null;
  overage_cents: number;
  total_cents: number;
  overage_rule: string;
  status: string;
  review_reason: string | null;
  has_contract_authority: boolean;
  journal_entry_id: string | null;
  created_at: string;
  transaction_at: string | null;
  fuel_type: string | null;
  /** ROUND 355 R-2 — the arithmetic of a gallon-rule overage. */
  gallons?: number | null;
  gallon_limit?: number | null;
  gallon_limit_source?: "unit_tank" | "reefer_tank" | "policy_per_swipe" | null;
  unit_price_cents?: number | null;
  exempt_reason?: "repair" | "authorized_spend" | null;
  exempt_work_order_id?: string | null;
  exempt_note?: string | null;
};

const LIMIT_SOURCE_LABEL: Record<string, string> = {
  unit_tank: "unit tank",
  reefer_tank: "reefer tank",
  policy_per_swipe: "per-swipe limit",
};

const RULE_LABEL: Record<string, string> = {
  non_fuel_purchase: "Non-fuel purchase",
  over_gallon_limit: "Over gallon limit",
  over_transaction_limit: "Over dollar limit",
  confirmed_fraud: "Confirmed fraud",
};

type ListResponse = {
  events: OverageEventRow[];
  total_count: number;
  has_more: boolean;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(cents / 100);
}

export async function listOverageEvents(
  companyId: string,
  status: string,
  filters: { driver_id?: string; unit_id?: string; event_id?: string } = {}
) {
  const params = new URLSearchParams({
    operating_company_id: companyId,
    status,
    limit: "100",
  });
  for (const [key, value] of Object.entries(filters)) {
    if (value) params.set(key, value);
  }
  return apiRequest<ListResponse>(`/api/v1/fuel/card-overage-events?${params.toString()}`);
}

export function CardOverageQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const actionGenerationRef = useRef(0);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [searchParams, setSearchParams] = useSearchParams();
  const eventId = searchParams.get("event_id") ?? undefined;
  const driverId = searchParams.get("driver_id") ?? undefined;
  const unitId = searchParams.get("unit_id") ?? undefined;
  // FUEL-MONEY-F6535-CARD-OVERAGE-APPROVAL-NATIVE-CONFIRM-AND-MUTABLE-COMPANY — the mutable-
  // company/generation half of this fix was already in place (approveMut already snapshots
  // {eventId, companyId, generation}); the remaining defect is window.confirm() bypassing
  // canonical modal chrome. Replaced with ConfirmModal (same component already used for
  // destructive/config confirmations elsewhere), holding the pending row until the operator
  // confirms or cancels.
  const [confirmApproveRow, setConfirmApproveRow] = useState<OverageEventRow | null>(null);
  const [exemptRow, setExemptRow] = useState<OverageEventRow | null>(null);

  useEffect(() => {
    actionGenerationRef.current += 1;
    setExemptRow(null);
    setConfirmApproveRow(null);
  }, [companyId]);
  // BANK-F5167 + CLS-ADJACENT — EntityPicker FKs stage with status; URL only on Apply.
  // LV-FUEL-TOOLBAR-LEAVES-POINT-HOME — do not keep dead set*Filter helpers that write URL immediately.
  const staged = useStagedListFilters({
    applied: {
      statusFilter,
      driverId: driverId || "",
      unitId: unitId || "",
    },
    empty: { statusFilter: "pending_review", driverId: "", unitId: "" },
    onApply: (next) => {
      setStatusFilter(next.statusFilter);
      setSearchParams(
        (prev) => {
          const params = new URLSearchParams(prev);
          if (next.driverId) params.set("driver_id", next.driverId);
          else params.delete("driver_id");
          if (next.unitId) params.set("unit_id", next.unitId);
          else params.delete("unit_id");
          return params;
        },
        { replace: true },
      );
    },
  });
  const effectiveDriverId = driverId || undefined;
  const effectiveUnitId = unitId || undefined;
  const hasEntityTarget = Boolean(eventId || effectiveDriverId || effectiveUnitId);

  const eventsQuery = useQuery({
    queryKey: ["fuel", "card-overage-events", companyId, statusFilter, eventId ?? null, effectiveDriverId ?? null, effectiveUnitId ?? null],
    queryFn: () => listOverageEvents(companyId, hasEntityTarget ? "all" : statusFilter, {
      event_id: eventId,
      driver_id: effectiveDriverId,
      unit_id: effectiveUnitId,
    }),
    enabled: Boolean(companyId),
  });

  /** @matrix-built modules=fuel cols=driver,unit,gl_je,connectivity,reverse_link */
  const approveMut = useMutation({
    mutationFn: (input: { eventId: string; companyId: string; generation: number }) =>
      apiRequest(`/api/v1/fuel/card-overage-events/${input.eventId}/approve`, {
        method: "POST",
        body: { operating_company_id: input.companyId },
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Overage recovery approved (posts only when GL flag is ON).", "success");
      void queryClient.invalidateQueries({ queryKey: ["fuel", "card-overage-events", input.companyId] });
    },
    onError: (err: unknown, input) => {
      if (input.generation === actionGenerationRef.current) {
        pushToast(userFacingApiError(err, "Approve failed"), "error");
      }
    },
  });

  const exemptMut = useMutation({
    mutationFn: (input: { eventId: string; companyId: string; generation: number } & ExemptOverageInput) =>
      apiRequest(`/api/v1/fuel/card-overage-events/${input.eventId}/exempt`, {
        method: "POST",
        body: {
          operating_company_id: input.companyId,
          reason: input.reason,
          work_order_id: input.work_order_id,
          note: input.note,
        },
      }),
    onSuccess: (_result, input) => {
      if (input.generation !== actionGenerationRef.current) return;
      pushToast("Exempted from recovery.", "success");
      void queryClient.invalidateQueries({ queryKey: ["fuel", "card-overage-events", input.companyId] });
    },
  });

  const rows = eventsQuery.data?.events ?? [];

  const columns = useMemo<ParityColumn<OverageEventRow>[]>(
    () => [
      {
        key: "created_at",
        label: "Detected",
        sortable: true,
        render: (row) => new Date(row.created_at).toLocaleString(),
      },
      {
        key: "transaction_at",
        label: "Txn at",
        sortable: true,
        render: (row) => (row.transaction_at ? new Date(row.transaction_at).toLocaleString() : "—"),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => <EntityLink kind="driver" id={row.driver_id ?? undefined} label={entityLabel(row.driver_name, row.driver_id, "Driver")} />,
      },
      {
        key: "unit_number",
        label: "Unit",
        sortable: true,
        render: (row) => <EntityLink kind="unit" id={row.unit_id ?? undefined} label={entityLabel(row.unit_number, row.unit_id, "Unit")} />,
      },
      {
        key: "overage_rule",
        label: "Rule",
        sortable: true,
        cellClass: "font-mono text-xs",
        render: (row) => RULE_LABEL[row.overage_rule] ?? row.overage_rule,
      },
      {
        key: "gallons",
        label: "Gallons / limit",
        sortable: true,
        cellClass: "text-right",
        render: (row) =>
          row.gallons != null && row.gallon_limit != null
            ? `${row.gallons} / ${row.gallon_limit} gal (${LIMIT_SOURCE_LABEL[row.gallon_limit_source ?? ""] ?? "limit"})`
            : "—",
      },
      {
        key: "overage_cents",
        label: "Overage",
        sortable: true,
        cellClass: "text-right",
        render: (row) => money(row.overage_cents),
      },
      {
        key: "total_cents",
        label: "Txn total",
        sortable: true,
        cellClass: "text-right",
        render: (row) => money(row.total_cents),
      },
      { key: "status", label: "Status", sortable: true, render: (row) => row.status },
      {
        key: "actions",
        label: "Actions",
        alwaysVisible: true,
        render: (row) => (
          <div className="flex flex-wrap gap-1">
            {row.status === "pending_review" ? (
              <ActionButton disabled={approveMut.isPending} onClick={() => setConfirmApproveRow(row)}>
                Approve recovery
              </ActionButton>
            ) : null}
            {row.overage_rule === "non_fuel_purchase" &&
            (row.status === "pending_review" || row.status === "company_variance") ? (
              <ActionButton disabled={exemptMut.isPending} onClick={() => setExemptRow(row)}>
                Exempt
              </ActionButton>
            ) : null}
            {row.status === "exempt_authorized" ? (
              row.exempt_work_order_id ? (
                <EntityLink kind="work_order" id={row.exempt_work_order_id} label="Repair WO" className="text-xs font-semibold text-slate-700 hover:underline" />
              ) : (
                <span className="text-xs text-gray-600" title={row.exempt_note ?? undefined}>Authorized</span>
              )
            ) : row.status === "pending_review" ? null : row.journal_entry_id ? (
              <EntityLink
                kind="journal_entry"
                id={row.journal_entry_id}
                label="JE"
                className="text-xs font-semibold text-slate-700 hover:underline"
              />
            ) : (
              <span className="text-xs text-gray-500">—</span>
            )}
          </div>
        ),
      },
    ],
    [approveMut, exemptMut]
  );

  if (!companyId) {
    return (
      <div className="space-y-3 p-3" data-testid="fuel-card-overage-need-company">
        <PageHeader title="Fuel card overage" subtitle="Approve-then-recover over-limit card charges" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-xs text-gray-700">
          Select an operating company to review fuel card overage events.
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="fuel-card-overage-queue">
      <PageHeader
        title="Fuel card overage"
        subtitle="Approve-then-recover over-limit / non-fuel card charges (BANK-F10 · FUEL-03)"
        actions={
          <Link to="/fuel" className="text-xs font-semibold text-slate-700 hover:underline">
            Back to Fuel Home
          </Link>
        }
      />

      <p className="rounded-sm border border-slate-200 bg-slate-100 px-3 py-2 text-xs text-slate-700">
        Engine + GL posting flags default OFF. Queue stays empty until{" "}
        <code className="font-mono">FUEL_CARD_OVERAGE_ENGINE_ENABLED</code> is on and events evaluate.
        Approve never invents density — it calls the same poster as the API.
      </p>

      <CollapsedListFilters
        activeFilterCount={
          (statusFilter !== "pending_review" ? 1 : 0) +
          (effectiveDriverId ? 1 : 0) +
          (effectiveUnitId ? 1 : 0)
        }
        onApply={staged.apply}
        onReset={staged.reset}
        onCancel={staged.cancel}
        applyDisabled={!staged.dirty}
        testIdPrefix="fuel-card-overage"
        dataAttributes={{ "data-fuel-card-overage-filter-toolbar": "collapsed" }}
      >
        <div className="flex flex-wrap items-end gap-3" data-testid="fuel-card-overage-filters">
          <label className="text-[11px] text-slate-600">
            Driver
            <EntityPicker
              kind="driver"
              operatingCompanyId={companyId}
              value={staged.draft.driverId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, driverId: next ?? "" })}
              allowCreate={false}
              placeholder="All drivers"
              className="mt-1"
              dataTestId="fuel-card-overage-filter-driver"
            />
          </label>
          <label className="text-[11px] text-slate-600">
            Unit
            <EntityPicker
              kind="unit"
              operatingCompanyId={companyId}
              value={staged.draft.unitId || null}
              onChange={(next) => staged.setDraft({ ...staged.draft, unitId: next ?? "" })}
              allowCreate={false}
              placeholder="All units"
              className="mt-1"
              dataTestId="fuel-card-overage-filter-unit"
            />
          </label>
          <div className="flex flex-wrap items-center gap-2">
            {["pending_review", "approved", "posted", "company_variance", "exempt_authorized", "all"].map((status) => (
              <button
                key={status}
                type="button"
                className={`rounded-sm border px-2 py-1 text-xs ${
                  staged.draft.statusFilter === status ? "border-slate-300 bg-slate-100" : "border-gray-300"
                }`}
                onClick={() => staged.setDraft({ ...staged.draft, statusFilter: status })}
              >
                {status.replace(/_/g, " ")}
              </button>
            ))}
          </div>
        </div>
      </CollapsedListFilters>

      {hasEntityTarget ? (
        <Link to="/fuel/card-overage" className="text-xs font-semibold text-slate-700 underline">
          Clear profile/event target
        </Link>
      ) : null}

      {eventsQuery.isError ? (
        <ListErrorState
          title="Couldn't load card overage events"
          status={0}
          message={(eventsQuery.error as Error)?.message}
          onRetry={() => void eventsQuery.refetch()}
        />
      ) : (
        <ParityTable
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={eventsQuery.isLoading}
          storageKey="fuel-card-overage-events"
          emptyText="No card overage events for this filter."
          exportFilename="fuel-card-overage-events"
        />
      )}

      <ConfirmModal
        open={confirmApproveRow != null}
        title="Approve recovery"
        message={
          confirmApproveRow
            ? `Approve recovery of ${money(confirmApproveRow.overage_cents)} for ${entityLabel(
                confirmApproveRow.driver_name,
                confirmApproveRow.driver_id,
                "Driver"
              )}? Posts JE only when FUEL_CARD_OVERAGE_GL_POSTING is ON.`
            : ""
        }
        confirmLabel="Approve recovery"
        onClose={() => setConfirmApproveRow(null)}
        onConfirm={async () => {
          if (!confirmApproveRow) return;
          await approveMut.mutateAsync({
            eventId: confirmApproveRow.id,
            companyId,
            generation: actionGenerationRef.current,
          });
        }}
      />
      <ExemptOverageModal
        open={exemptRow != null}
        companyId={companyId}
        summary={
          exemptRow
            ? `${money(exemptRow.overage_cents)} for ${entityLabel(exemptRow.driver_name, exemptRow.driver_id, "Driver")}`
            : ""
        }
        onClose={() => setExemptRow(null)}
        onConfirm={async (input) => {
          if (!exemptRow) return;
          await exemptMut.mutateAsync({
            eventId: exemptRow.id,
            companyId,
            generation: actionGenerationRef.current,
            ...input,
          });
        }}
      />
    </div>
  );
}
