import { useQuery } from "@tanstack/react-query";
import { apiRequest } from "../../api/client";
import { formatMoneyCents } from "./constants";
import { entityLabel, visibleDocumentLabel } from "../../lib/entity-label";
import { EntityLink } from "../shared/EntityLink";
import { ListErrorState } from "../ListErrorState";

/**
 * Load → Driver Pay tab reads driver_finance.driver_bills (header payables),
 * NOT settlement_lines. The prior bug mapped settlement-line shapes onto bills,
 * so every real payable rendered as $0 — FAIL-SETL-DRIVER-PAY-TAB.
 */
type DriverBillRow = {
  id: string;
  driver_id: string;
  driver_name?: string | null;
  load_id: string;
  load_number?: string | null;
  bill_number: string;
  gross_amount_cents: number;
  miles_basis?: number | null;
  miles_basis_type?: string | null;
  rate_per_mile_cents?: number | null;
  status: string;
  notes?: string | null;
  settled_in_settlement_id?: string | null;
  created_at: string;
};

type Props = {
  loadId: string;
  operatingCompanyId: string;
  currencyCode: "USD" | "MXN";
};

function statusBadge(status: string): string {
  switch (status) {
    case "open":
      return "bg-slate-100 text-slate-700";
    case "approved":
      return "bg-slate-100 text-slate-800";
    case "paid":
      return "bg-slate-200 text-slate-900";
    case "void":
      return "bg-gray-50 text-gray-400 line-through";
    case "disputed":
      return "bg-red-50 text-red-800";
    default:
      return "bg-gray-100 text-gray-700";
  }
}

function statusLabel(status: string): string {
  return status.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

function billDescription(bill: DriverBillRow): string {
  const parts: string[] = [];
  if (bill.miles_basis != null && bill.rate_per_mile_cents != null) {
    const basis = bill.miles_basis_type === "practical" ? "practical" : "short";
    parts.push(`${bill.miles_basis} ${basis} mi × ${formatMoneyCents(bill.rate_per_mile_cents, "USD")}/mi`);
  }
  if (bill.notes?.trim()) parts.push(bill.notes.trim());
  return parts.length > 0 ? parts.join(" · ") : "Driver payable";
}

export function LoadDetailDriverPayTab({ loadId, operatingCompanyId, currencyCode }: Props) {
  // Both load_id AND operating_company_id are REQUIRED by the endpoint (each missing → 400
  // validation_error, which the drawer rendered as the Driver Pay "error"). Only fire when both are
  // present so a transient empty value can't produce a malformed request.
  const hasParams = Boolean(loadId) && Boolean(operatingCompanyId);
  const billsQuery = useQuery({
    queryKey: ["driver-bills", "load", loadId, operatingCompanyId],
    enabled: hasParams,
    queryFn: () =>
      apiRequest<{ driver_bills: DriverBillRow[] }>(
        `/api/v1/driver-finance/driver-bills?load_id=${encodeURIComponent(loadId)}&operating_company_id=${encodeURIComponent(operatingCompanyId)}`
      ),
  });

  if (!hasParams || billsQuery.isLoading) {
    return <div className="py-8 text-center text-sm text-gray-500">Loading driver pay…</div>;
  }

  if (billsQuery.error) {
    const err = billsQuery.error as { status?: number };
    if (err?.status === 501) {
      return (
        <div className="rounded-sm border border-slate-200 bg-slate-100 p-4 text-sm text-slate-700">
          Driver finance module is not yet configured for this company.
        </div>
      );
    }
    if (err?.status === 403) {
      return (
        <div className="rounded-sm border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          You do not have permission to view driver pay for this load.
        </div>
      );
    }
    // DSP-MONEY-F7105-DRIVER-PAY-READ-FAILURE-DEAD-END (GO-0027, CC-1): the 501/501-not-configured
    // and 403-forbidden states above are deliberate terminal states, but a transient read failure
    // (network blip, 500, timeout) has no recovery path short of closing and reopening the whole
    // drawer. Give it a real Retry bound to the exact query instance.
    return (
      <ListErrorState
        title="Failed to load driver pay data."
        status={err?.status ?? 0}
        onRetry={() => void billsQuery.refetch()}
      />
    );
  }

  const bills: DriverBillRow[] = billsQuery.data?.driver_bills ?? [];

  if (bills.length === 0) {
    return (
      <div className="space-y-3">
        <div className="rounded-sm border border-gray-200 bg-gray-50 p-4 text-center text-sm text-gray-500">
          No driver bill for this load yet.
          <div className="mt-1 text-xs text-gray-400">
            Payables mint when the load is booked with miles and a driver pay rate (or on deliver when that path is armed). Settlement composition is separate.
          </div>
        </div>
      </div>
    );
  }

  const active = bills.filter((b) => b.status !== "void");
  const grossCents = active.reduce((sum, b) => sum + Number(b.gross_amount_cents ?? 0), 0);
  const voidedCount = bills.length - active.length;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2 rounded-sm border border-gray-200 bg-gray-50 p-3 text-sm">
        <div>
          <div className="text-xs text-gray-500">Driver bills (open/approved/paid)</div>
          <div className="font-semibold text-gray-900">{formatMoneyCents(grossCents, currencyCode)}</div>
        </div>
        <div>
          <div className="text-xs text-gray-500">Bill count</div>
          <div className="font-semibold text-gray-900">
            {active.length}
            {voidedCount > 0 ? <span className="ml-1 text-xs font-normal text-gray-500">(+{voidedCount} void)</span> : null}
          </div>
        </div>
      </div>

      <div className="space-y-1">
        <div className="text-xs font-semibold uppercase tracking-wide text-gray-500">Driver bills</div>
        {bills.map((bill) => {
          const cents = Number(bill.gross_amount_cents ?? 0);
          const isVoid = bill.status === "void";
          // driver_finance.driver_bills ≠ accounting.bills — kind="bill" drills to
          // /accounting/bills/:id and live-returns bill_not_found (L-20260810-0003 /
          // B-20260810-0003 → 31f155f3-…). No per-id driver-bill route yet; reverse to
          // settlement when settled, else driver profile. Never invent an AP bill link.
          return (
            <div key={bill.id} className="flex items-center justify-between rounded-sm border border-gray-100 p-2 text-sm">
              <div className="flex min-w-0 flex-col gap-0.5">
                <div className="flex flex-wrap items-center gap-1">
                  <span className={`rounded-sm px-1.5 py-0.5 text-[10px] font-semibold ${statusBadge(bill.status)}`}>
                    {statusLabel(bill.status)}
                  </span>
                  <span
                    className="truncate text-xs font-medium text-gray-800"
                    data-testid="load-driver-pay-bill-number"
                  >
                    {visibleDocumentLabel(bill.bill_number, bill.id, "Driver bill")}
                  </span>
                  {bill.settled_in_settlement_id ? (
                    <EntityLink
                      kind="settlement"
                      id={bill.settled_in_settlement_id}
                      label="Settlement"
                      className="truncate text-xs font-medium text-gray-800"
                      data-testid="load-driver-pay-settlement-link"
                    />
                  ) : null}
                  {bill.driver_id ? (
                    <EntityLink
                      kind="driver"
                      id={bill.driver_id}
                      label={entityLabel(bill.driver_name, bill.driver_id, "Driver")}
                      className="truncate text-xs font-medium text-gray-800"
                      data-testid="load-driver-pay-driver-link"
                    />
                  ) : null}
                </div>
                <span className="truncate text-xs text-gray-600">{billDescription(bill)}</span>
              </div>
              <span className={`ml-3 shrink-0 font-semibold ${isVoid ? "text-gray-400 line-through" : "text-gray-900"}`}>
                {formatMoneyCents(Math.abs(cents), currencyCode)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
