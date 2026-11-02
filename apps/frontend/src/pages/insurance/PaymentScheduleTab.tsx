import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listInsurancePaymentSchedule,
  markInsurancePaymentSchedulePaid,
  type InsurancePaymentSchedule,
  type PaymentScheduleStatus,
} from "../../api/insurance";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { BoardSection } from "../../components/v3/BoardSection";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { formatDateUS } from "../../lib/formatDate";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";
import { MultiSelectDropdown } from "../../components/forms/MultiSelectDropdown";

type Props = {
  operatingCompanyId?: string;
  policyId?: string;
};

const STATUS_FILTERS: Array<{ value: PaymentScheduleStatus; label: string }> = [
  { value: "scheduled", label: "Scheduled" },
  { value: "reminded", label: "Reminded" },
  { value: "paid", label: "Paid" },
  { value: "overdue", label: "Overdue" },
  { value: "late_fee_applied", label: "Late Fee Applied" },
];

function statusBadgeVariant(status: PaymentScheduleStatus): "neutral" | "warn" | "positive" | "crit" {
  if (status === "paid") return "positive";
  if (status === "overdue") return "warn";
  if (status === "late_fee_applied") return "crit";
  return "neutral";
}

function statusLabel(status: PaymentScheduleStatus): string {
  return status.replace(/_/g, " ");
}

function formatMoney(cents: number): string {
  return formatUsdCents(cents);
}

function canMarkPaid(schedule: InsurancePaymentSchedule): boolean {
  return schedule.status !== "paid";
}

export function PaymentScheduleTab({ operatingCompanyId, policyId }: Props) {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<string[]>([]);

  // INSURANCE-MONEY-F6628-PAYMENT-SCHEDULE-MARK-PAID-MUTABLE-SCOPE — markPaidMutation used to
  // submit only scheduleId and close over the LIVE operatingCompanyId/policyId props inside
  // mutationFn/onSuccess. A company or policy switch while the request is in flight could post
  // the "mark paid" write under the wrong company, or invalidate/toast for the wrong now-visible
  // context. Same fix idiom already used by units/UnitPermitsTab.tsx's deleteMutation: an
  // immutable scope generation snapshot at submit time, checked before any success/error effect
  // touches the cache or the UI.
  const scopeGenerationRef = useRef(0);

  useEffect(() => {
    scopeGenerationRef.current += 1;
  }, [operatingCompanyId, policyId]);

  const query = useQuery({
    queryKey: ["insurance-payment-schedule", operatingCompanyId ?? "none", policyId ?? "all", statusFilter.join(",") || "all"],
    queryFn: () =>
      listInsurancePaymentSchedule({
        operating_company_id: operatingCompanyId!,
        policy_id: policyId,
        // U12: multi-select — API accepts one status; 0/1 pass through; 2+ fetch all then filter.
        status: statusFilter.length === 1 ? (statusFilter[0] as PaymentScheduleStatus) : undefined,
      }).then((result) => {
        const rows = result.payment_schedules;
        if (statusFilter.length <= 1) return rows;
        return rows.filter((row) => statusFilter.includes(row.status));
      }),
    enabled: Boolean(operatingCompanyId),
  });

  // Empty message renders only once the schedule query settles (no first-fetch flash).
  const listState = useListState(query, (query.data ?? []).length === 0);

  const markPaidMutation = useMutation({
    mutationFn: (input: { scheduleId: string; operatingCompanyId: string; policyId: string | undefined; generation: number }) =>
      markInsurancePaymentSchedulePaid(input.scheduleId, input.operatingCompanyId),
    onSuccess: (_data, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      pushToast("Payment marked as paid", "success");
      void queryClient.invalidateQueries({
        queryKey: ["insurance-payment-schedule", input.operatingCompanyId, input.policyId ?? "all"],
      });
    },
    onError: (_error, input) => {
      if (input.generation !== scopeGenerationRef.current) return;
      pushToast("Failed to mark payment as paid", "error");
    },
  });
  const resetMarkPaidMutation = markPaidMutation.reset;

  useEffect(() => {
    resetMarkPaidMutation();
  }, [operatingCompanyId, policyId, resetMarkPaidMutation]);

  if (!operatingCompanyId) {
    return (
      <BoardSection title="Payment Schedule" testId="insurance-payment-schedule-need-company">
        <p className="px-3 py-2 text-xs text-[#4B5563]">Select an operating company to view payment schedules.</p>
      </BoardSection>
    );
  }

  const rows = query.data ?? [];

  const columns = useMemo<ParityColumn<InsurancePaymentSchedule>[]>(
    () => [
      { key: "due_date", label: "Due Date", sortable: true, render: (row) => <span className="text-gray-800">{formatDateUS(row.due_date)}</span> },
      { key: "amount_cents", label: "Amount", sortable: true, render: (row) => formatMoney(row.amount_cents) },
      { key: "late_fee_cents", label: "Late Fee", sortable: true, render: (row) => formatMoney(row.late_fee_cents) },
      { key: "status", label: "Status", sortable: true, render: (row) => <StatusBadge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</StatusBadge> },
    ],
    [],
  );

  return (
    <BoardSection title="Payment Schedule" testId="insurance-payment-schedule-board">
      <div className="mb-3 flex items-center gap-2 px-3 pt-3">
        <div className="text-xs font-semibold text-gray-600" data-testid="insurance-payment-status-filter">
          <span className="block">Payment status filter</span>
          <div className="mt-1">
            <MultiSelectDropdown
              label="Status"
              options={STATUS_FILTERS}
              selected={statusFilter}
              onChange={setStatusFilter}
              allLabel="All statuses"
              data-testid="insurance-payment-status-multiselect"
            />
          </div>
        </div>
      </div>

      {query.isError ? (
        <ListErrorState
          title="Couldn't load payment schedule"
          status={0}
          message={userFacingApiError(query.error, "Payment schedule is unavailable")}
          onRetry={() => void query.refetch()}
        />
      ) : (
        <ParityTable
          title="Premium payment schedule"
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={listState.isLoading}
          storageKey="insurance-payment-schedule"
          emptyText="No payment schedule records found."
          rowActions={(row) => (
            <Button
              size="sm"
              onClick={() =>
                markPaidMutation.mutate({
                  scheduleId: row.id,
                  operatingCompanyId: operatingCompanyId!,
                  policyId,
                  generation: scopeGenerationRef.current,
                })
              }
              disabled={!canMarkPaid(row)}
              loading={markPaidMutation.isPending && markPaidMutation.variables?.scheduleId === row.id}
            >
              Mark paid
            </Button>
          )}
        />
      )}
    </BoardSection>
  );
}
