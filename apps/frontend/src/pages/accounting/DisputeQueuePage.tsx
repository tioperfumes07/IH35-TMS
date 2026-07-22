import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  decideDispute,
  listDisputeQueue,
  startDisputeReview,
  type SettlementDisputeQueueRow,
} from "../../api/disputes";
import { ApiError } from "../../api/client";
import { useAuth } from "../../auth/useAuth";
import { Button } from "../../components/Button";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { SelectCombobox } from "../../components/shared/SelectCombobox";
import { CollapsedListFilters } from "../../components/table";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";

const DECIDE_ROLES = new Set(["Owner", "Administrator", "Accountant"]);

const STATUS_OPTIONS = [
  { value: "all", label: "All open-ish" },
  { value: "submitted", label: "Submitted" },
  { value: "under_review", label: "Under review" },
  { value: "approved", label: "Approved" },
  { value: "denied", label: "Denied" },
  { value: "withdrawn", label: "Withdrawn" },
] as const;

function money(cents: number | null | undefined) {
  if (cents == null || !Number.isFinite(Number(cents))) return "—";
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format(Number(cents) / 100);
}

function statusPill(status: string) {
  const base = "rounded-sm px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide";
  // §7 financial UI: slate status pills only (red reserved for delete/Accident).
  if (status === "denied") return `${base} border border-slate-200 bg-slate-100 text-slate-700`;
  if (status === "submitted" || status === "under_review" || status === "approved") {
    return `${base} border border-slate-200 bg-slate-100 text-slate-700`;
  }
  return `${base} border border-slate-200 bg-slate-50 text-slate-700`;
}

function errorCode(err: unknown): string | null {
  if (!(err instanceof ApiError)) return null;
  const data = err.data as { error?: string } | null;
  return typeof data?.error === "string" ? data.error : null;
}

function DecideModal({
  row,
  operatingCompanyId,
  onClose,
  onDecided,
}: {
  row: SettlementDisputeQueueRow;
  operatingCompanyId: string;
  onClose: () => void;
  onDecided: () => void;
}) {
  const [decision, setDecision] = useState<"approved" | "denied">("approved");
  const [resolutionText, setResolutionText] = useState("");
  const [adjustmentCents, setAdjustmentCents] = useState<number | null>(
    row.claimed_adjustment_cents != null && Number.isFinite(Number(row.claimed_adjustment_cents))
      ? Number(row.claimed_adjustment_cents)
      : null,
  );
  const [formError, setFormError] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: () => {
      const trimmed = resolutionText.trim();
      if (trimmed.length < 10) {
        throw new Error("Resolution text must be at least 10 characters.");
      }
      let adjustment_cents: number | undefined;
      if (decision === "approved") {
        if (adjustmentCents == null || !Number.isFinite(adjustmentCents) || adjustmentCents <= 0) {
          throw new Error("Approved decisions require a positive adjustment amount.");
        }
        adjustment_cents = Math.round(adjustmentCents);
      }
      return decideDispute(row.id, {
        operating_company_id: operatingCompanyId,
        decision,
        resolution_text: trimmed,
        adjustment_cents,
      });
    },
    onSuccess: () => onDecided(),
    onError: (err) => {
      const code = errorCode(err);
      if (code === "E_CORRECTIVE_JE_ACCOUNTS_MISSING") {
        setFormError(
          "Cannot approve: corrective journal-entry GL accounts are not configured for this company.",
        );
        return;
      }
      if (code === "decide_requires_under_review") {
        setFormError("Dispute must be under review before a decision.");
        return;
      }
      if (code === "adjustment_required") {
        setFormError("Approved decisions require a positive adjustment amount.");
        return;
      }
      setFormError(err instanceof Error ? err.message : "Decide failed.");
    },
  });

  return (
    <div className="fixed inset-0 z-40 flex items-center justify-center overflow-y-auto bg-black/40 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-lg space-y-3 rounded-sm border border-gray-200 bg-white p-4 shadow-lg">
        <h2 className="text-base font-semibold text-gray-900">Decide dispute</h2>
        <p className="text-xs text-gray-600">
          {row.driver_name ?? "Driver"} ·{" "}
          <EntityLink kind="settlement" id={row.settlement_id} label={row.settlement_display_id ?? row.settlement_id} /> · claimed{" "}
          {money(row.claimed_adjustment_cents)}
        </p>
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Decision
          <SelectCombobox
            value={decision}
            onChange={(e) => setDecision(e.target.value as "approved" | "denied")}
            className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
          >
            <option value="approved">Approve</option>
            <option value="denied">Deny</option>
          </SelectCombobox>
        </label>
        {decision === "approved" ? (
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Adjustment (USD)
            <MoneyInput
              valueCents={adjustmentCents}
              onChangeCents={setAdjustmentCents}
              ariaLabel="Adjustment amount (USD)"
              className="h-9 w-full rounded-sm border border-gray-300 text-[13px]"
            />
          </label>
        ) : null}
        <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
          Resolution notes (min 10 chars)
          <textarea
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            rows={4}
            className="rounded-sm border border-gray-300 px-2 py-1 text-[13px]"
          />
        </label>
        {formError ? <p className="text-sm text-red-600">{formError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Submit decision"}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function DisputeQueuePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const canDecide = DECIDE_ROLES.has(String(auth.user?.role ?? ""));
  const [status, setStatus] = useState<string>("submitted");
  const [decideRow, setDecideRow] = useState<SettlementDisputeQueueRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["accounting", "dispute-queue", companyId, status],
    queryFn: () => listDisputeQueue(companyId, { status, limit: 100, offset: 0 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const startReviewMut = useMutation({
    mutationFn: (row: SettlementDisputeQueueRow) => startDisputeReview(row.id, companyId),
    onSuccess: async () => {
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ["accounting", "dispute-queue", companyId] });
    },
    onError: (err) => {
      const code = errorCode(err);
      if (code === "invalid_status_for_start_review") {
        setActionError("Only submitted disputes can start review.");
        return;
      }
      setActionError(err instanceof Error ? err.message : "Start review failed.");
    },
  });

  const rows = query.data?.disputes ?? [];

  const columns = useMemo<ParityColumn<SettlementDisputeQueueRow>[]>(
    () => [
      {
        key: "settlement_display_id",
        label: "Settlement",
        sortable: true,
        render: (row) => (
          <EntityLink kind="settlement" id={row.settlement_id} label={row.settlement_display_id ?? row.settlement_id} />
        ),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => row.driver_name ?? row.driver_id.slice(0, 8),
      },
      {
        key: "reason_code",
        label: "Reason",
        sortable: true,
        render: (row) => (
          <span title={row.reason_text}>
            {row.reason_code}
            {row.reason_text ? ` — ${row.reason_text.slice(0, 48)}${row.reason_text.length > 48 ? "…" : ""}` : ""}
          </span>
        ),
      },
      {
        key: "claimed_adjustment_cents",
        label: "Claimed",
        sortable: true,
        render: (row) => money(row.claimed_adjustment_cents),
      },
      {
        key: "status",
        label: "Status",
        sortable: true,
        render: (row) => <span className={statusPill(String(row.status))}>{String(row.status).replaceAll("_", " ")}</span>,
      },
      {
        key: "submitted_at",
        label: "Submitted",
        sortable: true,
        render: (row) => formatDateUS(row.submitted_at),
      },
      {
        key: "id",
        label: "Actions",
        sortable: false,
        render: (row) => {
          if (!canDecide) return <span className="text-xs text-gray-400">View only</span>;
          if (row.status === "submitted") {
            return (
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={startReviewMut.isPending}
                onClick={(e) => {
                  e.stopPropagation();
                  startReviewMut.mutate(row);
                }}
              >
                Start review
              </Button>
            );
          }
          if (row.status === "under_review") {
            return (
              <Button
                type="button"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  setDecideRow(row);
                }}
              >
                Decide
              </Button>
            );
          }
          return <span className="text-xs text-gray-400">—</span>;
        },
      },
    ],
    [canDecide, startReviewMut],
  );

  if (!companyId) {
    return (
      <AccountingSubNavWrapper title="Settlement dispute queue" subtitle="Office workflows for P6 settlement disputes">
        <p className="text-sm text-red-600">Select operating company.</p>
      </AccountingSubNavWrapper>
    );
  }

  if (query.isError) {
    return (
      <AccountingSubNavWrapper title="Settlement dispute queue" subtitle="Office workflows for P6 settlement disputes">
        <ListErrorState
          title="Couldn't load dispute queue"
          status={(query.error as ApiError | undefined)?.status ?? 0}
          message={(query.error as Error | undefined)?.message}
          onRetry={() => void query.refetch()}
        />
      </AccountingSubNavWrapper>
    );
  }

  return (
    <AccountingSubNavWrapper title="Settlement dispute queue" subtitle="Office workflows for P6 settlement disputes">
      <div className="flex flex-wrap items-end gap-3">
        <CollapsedListFilters
          activeFilterCount={status !== "submitted" ? 1 : 0}
          testIdPrefix="dispute-queue"
          dataAttributes={{ "data-dispute-queue-filter-toolbar": "collapsed" }}
        >
          <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
            Status
            <SelectCombobox
              value={status}
              onChange={(e) => setStatus(e.target.value)}
              className="h-9 rounded-sm border border-gray-300 px-2 text-[13px]"
              aria-label="Dispute status filter"
            >
              {STATUS_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </SelectCombobox>
          </label>
        </CollapsedListFilters>
        <Button size="sm" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
        {query.data ? (
          <span className="text-xs text-gray-500">
            {query.data.total} dispute{query.data.total === 1 ? "" : "s"}
          </span>
        ) : null}
      </div>

      {actionError ? <p className="text-sm text-red-600">{actionError}</p> : null}

      <ParityTable
        columns={columns}
        rows={rows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        storageKey="dispute-queue"
        exportFilename="settlement-disputes"
        initialPageSize={50}
        emptyText="No disputes for selected filters."
      />

      {decideRow ? (
        <DecideModal
          row={decideRow}
          operatingCompanyId={companyId}
          onClose={() => setDecideRow(null)}
          onDecided={() => {
            setDecideRow(null);
            void queryClient.invalidateQueries({ queryKey: ["accounting", "dispute-queue", companyId] });
          }}
        />
      ) : null}
    </AccountingSubNavWrapper>
  );
}
