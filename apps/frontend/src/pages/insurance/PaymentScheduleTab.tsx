import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
  return `$${(cents / 100).toFixed(2)}`;
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
      <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-600">
        Select an operating company to view payment schedules.
      </div>
    );
  }

  const rows = query.data ?? [];

  return (
    <DataPanel title="Payment Schedule">
      <div className="mb-3 flex items-center gap-2">
        <label className="text-xs font-semibold text-gray-600">
          Status filter
          <select
            className="ml-2 rounded border border-gray-300 px-2 py-1 text-xs"
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

      {query.isLoading ? <div className="text-sm text-gray-500">Loading payment schedule...</div> : null}
      {query.isError ? (
        <div className="rounded border border-red-200 bg-red-50 p-2 text-sm text-red-700">Failed to load payment schedule.</div>
      ) : null}
      {!query.isLoading && rows.length === 0 ? <div className="text-sm text-gray-600">No payment schedule records found.</div> : null}

      {rows.length > 0 ? (
        <div className="overflow-x-auto">
          <table className="min-w-full text-left text-xs">
            <thead>
              <tr className="border-b border-gray-200 text-gray-600">
                <th className="px-2 py-1.5 font-semibold">Due Date</th>
                <th className="px-2 py-1.5 font-semibold">Amount</th>
                <th className="px-2 py-1.5 font-semibold">Late Fee</th>
                <th className="px-2 py-1.5 font-semibold">Status</th>
                <th className="px-2 py-1.5 font-semibold">Actions</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-b border-gray-100">
                  <td className="px-2 py-1.5 text-gray-800">{row.due_date}</td>
                  <td className="px-2 py-1.5 text-gray-700">{formatMoney(row.amount_cents)}</td>
                  <td className="px-2 py-1.5 text-gray-700">{formatMoney(row.late_fee_cents)}</td>
                  <td className="px-2 py-1.5">
                    <StatusBadge variant={statusBadgeVariant(row.status)}>{statusLabel(row.status)}</StatusBadge>
                  </td>
                  <td className="px-2 py-1.5">
                    <Button
                      size="sm"
                      onClick={() => markPaidMutation.mutate(row.id)}
                      disabled={!canMarkPaid(row)}
                      loading={markPaidMutation.isPending && markPaidMutation.variables === row.id}
                    >
                      Mark paid
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </DataPanel>
  );
}
