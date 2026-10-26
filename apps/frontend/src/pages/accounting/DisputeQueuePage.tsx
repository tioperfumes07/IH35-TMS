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
import { Modal } from "../../components/Modal";
import { MoneyInput } from "../../components/forms/MoneyInput";
import { ListErrorState } from "../../components/ListErrorState";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { EntityLink } from "../../components/shared/EntityLink";
import { entityLabel } from "../../lib/entity-label";
import { SelectCombobox } from "../../components/Combobox";
import { MoneyListToolbar } from "../../components/table/MoneyListToolbar";
import { useCompanyContext } from "../../contexts/CompanyContext";
import { formatDateUS } from "../../lib/formatDate";
import { AccountingSubNavWrapper } from "./AccountingSubNavWrapper";
import { statusPill } from "../../components/shared/statusPill";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";
import { formatUsdCents, TABLE_MISSING } from "../../utils/qboFormat";
import { FORM_LABEL_STACK_CLASS, FORM_INPUT_CLASS } from "../../components/forms/inputClass";
import { moneyListKpiCard } from "./moneyListKpiCard";

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
  if (cents == null || !Number.isFinite(Number(cents))) return TABLE_MISSING;
  return formatUsdCents(Number(cents));
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
    meta: { loads: true },
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
    <Modal open onClose={onClose} title="Decide dispute" size="sm" modalKind="dispute-queue-decide">
      {/* role="dialog" — accessible modal; applied by Modal host to its root container */}
      <div className="space-y-3 text-xs">
        <p className="text-gray-600">
          <EntityLink kind="driver" id={row.driver_id} label={entityLabel(row.driver_name, row.driver_id, "Driver")} /> ·{" "}
          <EntityLink kind="settlement" id={row.settlement_id} label={entityLabel(row.settlement_display_id, row.settlement_id, "Settlement")} /> · claimed{" "}
          {money(row.claimed_adjustment_cents)}
        </p>
        <label className={FORM_LABEL_STACK_CLASS}>
          Decision
          <SelectCombobox
            value={decision}
            onChange={(e) => setDecision(e.target.value as "approved" | "denied")}
            className={`${FORM_INPUT_CLASS} rounded-sm border border-gray-300 px-2`}
          >
            <option value="approved">Approve</option>
            <option value="denied">Deny</option>
          </SelectCombobox>
        </label>
        {decision === "approved" ? (
          <label className={FORM_LABEL_STACK_CLASS}>
            Adjustment (USD)
            <MoneyInput
              valueCents={adjustmentCents}
              onChangeCents={setAdjustmentCents}
              ariaLabel="Adjustment amount (USD)"
              className={`${FORM_INPUT_CLASS} w-full rounded-sm border border-gray-300`}
            />
          </label>
        ) : null}
        <label className={FORM_LABEL_STACK_CLASS}>
          Resolution notes (min 10 chars)
          <textarea
            value={resolutionText}
            onChange={(e) => setResolutionText(e.target.value)}
            rows={4}
            className="rounded-sm border border-gray-300 px-2 py-1 text-xs"
          />
        </label>
        {formError ? <p className="text-xs text-red-600">{formError}</p> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" size="sm" onClick={onClose} disabled={mutation.isPending}>
            Cancel
          </Button>
          <Button type="button" size="sm" onClick={() => mutation.mutate()} disabled={mutation.isPending}>
            {mutation.isPending ? "Saving…" : "Submit decision"}
          </Button>
        </div>
      </div>
    </Modal>
  );
}

export function DisputeQueuePage() {
  const auth = useAuth();
  const queryClient = useQueryClient();
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const canDecide = DECIDE_ROLES.has(String(auth.user?.role ?? ""));
  // U12 (owner UI register 2026-10-03) — status is a multi-select; default Submitted; none picked = every status.
  const [status, setStatus] = useState<string[]>(["submitted"]);
  const [search, setSearch] = useState("");
  const [decideRow, setDecideRow] = useState<SettlementDisputeQueueRow | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const query = useQuery({
    queryKey: ["accounting", "dispute-queue", companyId, status],
    queryFn: () => listDisputeQueue(companyId, { status, limit: 100, offset: 0 }),
    enabled: Boolean(companyId),
    retry: false,
  });

  const startReviewMut = useMutation({
    meta: { loads: true },
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
  const total = query.data?.total ?? 0;

  const visibleRows = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((row) => {
      const hay = [
        row.settlement_display_id,
        row.driver_name,
        row.reason_code,
        row.reason_text,
        row.status,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [rows, search]);

  const disputeKpis = useMemo(() => {
    let submitted = 0;
    let underReview = 0;
    let claimedCents = 0;
    for (const row of visibleRows) {
      if (row.status === "submitted") submitted += 1;
      if (row.status === "under_review") underReview += 1;
      if (row.claimed_adjustment_cents != null && Number.isFinite(Number(row.claimed_adjustment_cents))) {
        claimedCents += Number(row.claimed_adjustment_cents);
      }
    }
    return { submitted, underReview, claimedCents };
  }, [visibleRows]);

  const activeFilterCount = status.length === 1 && status[0] === "submitted" ? 0 : 1;

  const columns = useMemo<ParityColumn<SettlementDisputeQueueRow>[]>(
    () => [
      {
        key: "settlement_display_id",
        label: "Settlement",
        sortable: true,
        render: (row) => (
          <EntityLink kind="settlement" id={row.settlement_id} label={entityLabel(row.settlement_display_id, row.settlement_id, "Settlement")} />
        ),
      },
      {
        key: "driver_name",
        label: "Driver",
        sortable: true,
        render: (row) => (
          <EntityLink
            kind="driver"
            id={row.driver_id}
            label={entityLabel(row.driver_name, row.driver_id, "Driver")}
            data-testid="dispute-queue-driver-link"
          />
        ),
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
        <p className="text-xs text-red-600">Select operating company.</p>
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

  const filterBar = (
    <div className="w-full space-y-2" data-dispute-queue-filter-toolbar="visible">
      <div className="flex flex-wrap items-end gap-2">
        <MoneyListToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Search settlement, driver, reason…"
          searchTestId="dispute-queue-search-input"
          onClearAll={() => {
            setSearch("");
            setStatus(["submitted"]);
          }}
          activeFilterCount={activeFilterCount}
          testIdPrefix="dispute-queue"
          className="flex-1 min-w-[280px]"
        >
          <MultiSelectDropdown
            label="Status"
            options={STATUS_OPTIONS.filter((opt) => opt.value !== "all").map((opt) => ({ value: opt.value, label: opt.label }))}
            selected={status}
            onChange={setStatus}
            allLabel="All statuses"
            data-testid="dispute-queue-status-filter"
          />
        </MoneyListToolbar>
        <Button size="sm" variant="secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>
          Refresh
        </Button>
      </div>
    </div>
  );

  return (
    <AccountingSubNavWrapper
      title="Settlement dispute queue"
      subtitle="Office workflows for P6 settlement disputes"
      kpiStrip={
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4" data-testid="dispute-queue-kpi-strip">
          {query.isError ? (
            <>
              {moneyListKpiCard("Total", "—", "Error loading")}
              {moneyListKpiCard("Submitted", "—", "Error loading")}
              {moneyListKpiCard("Under review", "—", "Error loading")}
              {moneyListKpiCard("Claimed", "—", "Error loading")}
            </>
          ) : (
            <>
              {moneyListKpiCard("Total", String(total), "API match")}
              {moneyListKpiCard("Submitted", String(disputeKpis.submitted), "Visible rows")}
              {moneyListKpiCard("Under review", String(disputeKpis.underReview), "Visible rows")}
              {moneyListKpiCard("Claimed", money(disputeKpis.claimedCents), "Visible rows")}
            </>
          )}
        </div>
      }
    >
      {filterBar}

      {actionError ? <p className="text-xs text-red-600">{actionError}</p> : null}

      <ParityTable
        title="Settlement disputes — queue"
        columns={columns}
        rows={visibleRows}
        rowKey={(row) => row.id}
        loading={query.isPending || (query.isFetching && rows.length === 0)}
        storageKey="dispute-queue"
        exportFilename="settlement-disputes"
        initialPageSize={50}
        emptyText="No disputes for selected filters."
        suppressToolbarSearch
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
