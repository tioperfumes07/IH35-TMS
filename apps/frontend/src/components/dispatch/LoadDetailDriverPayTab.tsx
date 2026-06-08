import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatMoneyCents } from "./constants";

type DriverBillRow = {
  id: string;
  driver_id: string;
  load_id: string;
  line_type: string;
  amount: number | null;
  amount_cents: number | null;
  description: string | null;
  created_at: string;
};

type Props = {
  loadId: string;
  operatingCompanyId: string;
  currencyCode: "USD" | "MXN";
};

function getAmountCents(row: DriverBillRow): number {
  if (row.amount_cents !== null && row.amount_cents !== undefined) return Number(row.amount_cents);
  if (row.amount !== null && row.amount !== undefined) return Math.round(Number(row.amount) * 100);
  return 0;
}

const EARNINGS_TYPES = new Set(["earnings", "extra_pay", "team_split_primary", "team_split_secondary"]);
const DEDUCTION_TYPES = new Set(["deduction", "abandonment_chargeback"]);
const ADVANCE_TYPES = new Set(["advance", "cash_advance"]);
const REIMBURSEMENT_TYPES = new Set(["reimbursement"]);

function lineTypeBadge(type: string): string {
  if (EARNINGS_TYPES.has(type)) return "bg-green-100 text-green-800";
  if (DEDUCTION_TYPES.has(type)) return "bg-red-100 text-red-800";
  if (ADVANCE_TYPES.has(type)) return "bg-orange-100 text-orange-800";
  if (REIMBURSEMENT_TYPES.has(type)) return "bg-blue-100 text-blue-800";
  return "bg-gray-100 text-gray-700";
}

function lineTypeLabel(type: string): string {
  return type.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export function LoadDetailDriverPayTab({ loadId, operatingCompanyId, currencyCode }: Props) {
  const billsQuery = useQuery({
    queryKey: ["driver-bills", "load", loadId, operatingCompanyId],
    queryFn: () =>
      apiRequest<{ driver_bills: DriverBillRow[] }>(
        `/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(loadId)}&operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  if (billsQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading driver pay…</div>;
  }

  if (billsQuery.error) {
    const err = billsQuery.error as { status?: number };
    if (err?.status === 501) {
      return (
        <div className="rounded border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          Driver finance module is not yet configured for this company.
        </div>
      );
    }
    if (err?.status === 403) {
      return (
        <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          You do not have permission to view driver pay for this load.
        </div>
      );
    }
    return (
      <div className="rounded border border-red-200 bg-red-50 p-4 text-sm text-red-700">
        Failed to load driver pay data.
      </div>
    );
  }

  const bills: DriverBillRow[] = billsQuery.data?.driver_bills ?? [];

  if (bills.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
          No pay lines recorded yet for this load.
          <div className="mt-1 text-xs text-gray-400">
            Pay lines populate once a settlement is composed for the assigned driver.
          </div>
        </div>
      </div>
    );
  }

  let grossCents = 0;
  let deductionsCents = 0;
  let advanceCents = 0;
  let reimbursementsCents = 0;

  for (const bill of bills) {
    const cents = getAmountCents(bill);
    if (EARNINGS_TYPES.has(bill.line_type)) grossCents += cents;
    else if (DEDUCTION_TYPES.has(bill.line_type)) deductionsCents += cents;
    else if (ADVANCE_TYPES.has(bill.line_type)) advanceCents += cents;
    else if (REIMBURSEMENT_TYPES.has(bill.line_type)) reimbursementsCents += cents;
  }

  const netCents = grossCents - deductionsCents - advanceCents + reimbursementsCents;

  return (
    <div className="space-y-4">
      {/* Summary card */}
      <div className="grid grid-cols-2 gap-2 rounded border border-gray-200 bg-gray-50 p-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Gross earnings</div>
          <div className="font-semibold text-gray-900">{formatMoneyCents(grossCents, currencyCode)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Deductions</div>
          <div className="font-semibold text-red-600">
            {deductionsCents > 0 ? `−${formatMoneyCents(deductionsCents, currencyCode)}` : formatMoneyCents(0, currencyCode)}
          </div>
        </div>
        {advanceCents > 0 ? (
          <div>
            <div className="text-xs text-gray-500">Advance offset</div>
            <div className="font-semibold text-orange-600">−{formatMoneyCents(advanceCents, currencyCode)}</div>
          </div>
        ) : null}
        {reimbursementsCents > 0 ? (
          <div>
            <div className="text-xs text-gray-500">Reimbursements</div>
            <div className="font-semibold text-blue-600">+{formatMoneyCents(reimbursementsCents, currencyCode)}</div>
          </div>
        ) : null}
        <div className="col-span-2 border-t border-gray-200 pt-2">
          <div className="text-xs font-semibold text-gray-500">Net pay</div>
          <div className={`text-base font-bold ${netCents >= 0 ? "text-green-700" : "text-red-700"}`}>
            {formatMoneyCents(netCents, currencyCode)}
          </div>
        </div>
      </div>

      {/* Line items */}
      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Pay Lines</div>
        {bills.map((bill) => {
          const cents = getAmountCents(bill);
          const isNegative = DEDUCTION_TYPES.has(bill.line_type) || ADVANCE_TYPES.has(bill.line_type);
          return (
            <div key={bill.id} className="flex items-center justify-between rounded border border-gray-100 p-2 text-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className={`self-start rounded px-1.5 py-0.5 text-[10px] font-semibold ${lineTypeBadge(bill.line_type)}`}>
                  {lineTypeLabel(bill.line_type)}
                </span>
                <span className="truncate text-xs text-gray-600">{bill.description || "—"}</span>
              </div>
              <span className={`ml-3 shrink-0 font-semibold ${isNegative ? "text-red-600" : "text-gray-900"}`}>
                {isNegative ? "−" : ""}
                {formatMoneyCents(Math.abs(cents), currencyCode)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
