import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link, useSearchParams } from "react-router-dom";
import { apiRequest } from "../../../api/client";
import { PageHeader } from "../../../components/layout/PageHeader";
import { ActionButton } from "../../../components/shared/ActionButton";
import { useToast } from "../../../components/Toast";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { userFacingApiError } from "../../../lib/api-error-message";
import { ListErrorState } from "../../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../../components/parity/ParityTable";
import { entityLabel } from "../../../lib/entity-label";
import { EntityLink } from "../../../components/shared/EntityLink";

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
    ...filters,
  });
  return apiRequest<ListResponse>(`/api/v1/fuel/card-overage-events?${params.toString()}`);
}

export function CardOverageQueuePage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [searchParams] = useSearchParams();
  const eventId = searchParams.get("event_id") ?? undefined;
  const driverId = searchParams.get("driver_id") ?? undefined;
  const unitId = searchParams.get("unit_id") ?? undefined;
  const hasEntityTarget = Boolean(eventId || driverId || unitId);

  const eventsQuery = useQuery({
    queryKey: ["fuel", "card-overage-events", companyId, statusFilter, eventId ?? null, driverId ?? null, unitId ?? null],
    queryFn: () => listOverageEvents(companyId, hasEntityTarget ? "all" : statusFilter, {
      event_id: eventId,
      driver_id: driverId,
      unit_id: unitId,
    }),
    enabled: Boolean(companyId),
  });

  const invalidate = () => {
    void queryClient.invalidateQueries({ queryKey: ["fuel", "card-overage-events"] });
  };

  const approveMut = useMutation({
    mutationFn: (id: string) =>
      apiRequest(`/api/v1/fuel/card-overage-events/${id}/approve`, {
        method: "POST",
        body: { operating_company_id: companyId },
      }),
    onSuccess: () => {
      pushToast("Overage recovery approved (posts only when GL flag is ON).", "success");
      invalidate();
    },
    onError: (err: unknown) => {
      pushToast(userFacingApiError(err, "Approve failed"), "error");
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
        cellClass: "font-mono text-[10px]",
        render: (row) => row.overage_rule,
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
              <ActionButton
                disabled={approveMut.isPending}
                onClick={() => {
                  if (
                    window.confirm(
                      `Approve recovery of ${money(row.overage_cents)} for ${entityLabel(row.driver_name, row.driver_id, "Driver")}? Posts JE only when FUEL_CARD_OVERAGE_GL_POSTING is ON.`
                    )
                  ) {
                    approveMut.mutate(row.id);
                  }
                }}
              >
                Approve recovery
              </ActionButton>
            ) : row.journal_entry_id ? (
              <Link
                to={`/accounting/journal-entries/${row.journal_entry_id}`}
                className="text-xs font-semibold text-slate-700 hover:underline"
              >
                JE
              </Link>
            ) : (
              <span className="text-[10px] text-gray-500">—</span>
            )}
          </div>
        ),
      },
    ],
    [approveMut]
  );

  if (!companyId) {
    return (
      <div className="space-y-3 p-3" data-testid="fuel-card-overage-need-company">
        <PageHeader title="Fuel card overage" subtitle="Approve-then-recover over-limit card charges" />
        <div className="rounded-sm border border-dashed border-gray-300 bg-gray-50 p-4 text-sm text-gray-700">
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

      <div className="flex flex-wrap items-center gap-2">
        {hasEntityTarget ? (
          <Link to="/fuel/card-overage" className="text-xs font-semibold text-slate-700 underline">
            Clear profile/event target
          </Link>
        ) : null}
        {["pending_review", "approved", "posted", "company_variance", "all"].map((status) => (
          <button
            key={status}
            type="button"
            className={`rounded-sm border px-2 py-1 text-xs ${
              statusFilter === status ? "border-slate-300 bg-slate-100" : "border-gray-300"
            }`}
            onClick={() => setStatusFilter(status)}
          >
            {status.replace(/_/g, " ")}
          </button>
        ))}
      </div>

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
    </div>
  );
}
