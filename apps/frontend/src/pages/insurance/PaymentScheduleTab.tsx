import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  listInsurancePaymentSchedule,
  markInsurancePaymentSchedulePaid,
  type InsurancePaymentSchedule,
  type PaymentScheduleStatus,
} from "../../api/insurance";
import { Button } from "../../components/Button";
import { useToast } from "../../components/Toast";
import { DataPanel } from "../../components/layout/DataPanel";
import { StatusBadge } from "../../components/layout/StatusBadge";
import { formatDateUS } from "../../lib/formatDate";
import { useListState } from "../../components/list-state";
import { formatUsdCents } from "../../lib/money";
import { ParityTable, type ParityColumn } from "../../components/parity/ParityTable";
import { ListErrorState } from "../../components/ListErrorState";
import { userFacingApiError } from "../../lib/api-error-message";

type Props = {
  operatingCompanyId?: string;
  policyId?: string;
};

const STATUS_FILTERS: Array<{ value: "" | PaymentScheduleStatus; label: string }> = [
  { value: "", label: "All" },
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
  const [statusFilter, setStatusFilter] = useState<"" | PaymentScheduleStatus>("");

  const query = useQuery({
    queryKey: ["insurance-payment-schedule", operatingCompanyId ?? "none", policyId ?? "all", statusFilter || "all"],
    queryFn: () =>
      listInsurancePaymentSchedule({
        operating_company_id: operatingCompanyId!,
        policy_id: policyId,
        status: statusFilter || undefined,
      }).then((result) => result.payment_schedules),
    enabled: Boolean(operatingCompanyId),
  });

  // Empty message renders only once the schedule query settles (no first-fetch flash).
  const listState = useListState(query, (query.data ?? []).length === 0);

  const markPaidMutation = useMutation({
    mutationFn: (scheduleId: string) => markInsurancePaymentSchedulePaid(scheduleId, operatingCompanyId!),
    onSuccess: () => {
      pushToast("Payment marked as paid", "success");
      void queryClient.invalidateQueries({
        queryKey: ["insurance-payment-schedule", operatingCompanyId ?? "none", policyId ?? "all"],
      });
    },
    onError: () => pushToast("Failed to mark payment as paid", "error"),
  });

  if (!operatingCompanyId) {
    return (
      <div className="rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view payment schedules.
      </div>
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
    <DataPanel title="Payment Schedule">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-600">
          Payment status filter
          <select
            className="ml-2 rounded-sm border border-gray-300 px-2 py-1 text-xs"
            value={statusFilter}
            onChange={(event) => setStatusFilter((event.target.value || "") as "" | PaymentScheduleStatus)}
          >
            {STATUS_FILTERS.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
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
          rows={rows}
          columns={columns}
          rowKey={(row) => row.id}
          loading={listState.isLoading}
          storageKey="insurance-payment-schedule"
          emptyText="No payment schedule records found."
          rowActions={(row) => (
            <Button
              size="sm"
              onClick={() => markPaidMutation.mutate(row.id)}
              disabled={!canMarkPaid(row)}
              loading={markPaidMutation.isPending && markPaidMutation.variables === row.id}
            >
              Mark paid
            </Button>
          )}
        />
      )}
    </DataPanel>
  );
}
