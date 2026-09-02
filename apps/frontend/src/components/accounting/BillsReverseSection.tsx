import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { billVendorDrillId, listBills, type VendorBill } from "../../api/accounting";
import { formatDateUS } from "../../lib/formatDate";
import { formatMoneyCents } from "../dispatch/constants";
import { EntityLink } from "../shared/EntityLink";
import { EntityLinkOrTombstone } from "../shared/EntityLinkOrTombstone";
import { visibleDocumentLabel } from "../../lib/entity-label";
import { CappedListNotice } from "../CappedListNotice";
import { Button } from "../Button";
import { useToast } from "../Toast";
import { PayBillModal } from "../../pages/accounting/PayBillModal";

const BILLS_REVERSE_LIST_LIMIT = 200;

/**
 * FINAL-WEEKEND-FULL-WIRING-2026-08-12 rank 6 — Built reverse_link for bills.
 * ACCT-F5035: insurance_claim_id on ClaimsTab.
 * ACCT-F5036: unit_id on VehicleProfilePage (create already stamps unit_id).
 * ACCT-F5037: load_id via bill_lines on LoadDetailDrawer.
 * GO-23 N1 remainder (owner direct instruction 2026-09-02) — "still missing on the load surface:
 * bill create and bill-payment create load-scoped." Reuses the SAME PayBillModal every other
 * bill-payment entry point already uses (VendorBalancesPage.tsx) — no new payment UI invented.
 */

function billRemainingCents(bill: VendorBill) {
  if (bill.balance_cents != null) return Number(bill.balance_cents);
  return Math.max(0, Number(bill.amount_cents) - Number(bill.paid_cents));
}

type Filter =
  | { insurance_claim_id: string; unit_id?: never; load_id?: never }
  | { unit_id: string; insurance_claim_id?: never; load_id?: never }
  | { load_id: string; insurance_claim_id?: never; unit_id?: never };

type Props = {
  operatingCompanyId: string;
  filter: Filter;
  contextLabel: string;
  /** GO-18 (owner correction 2026-09-02, N1 gap) — load's own display number, carried into the
   *  Add Bill URL's ?load_number= so the create-page banner and memo never show a raw UUID.
   *  Mirrors ExpensesReverseSection.createLoadNumber exactly. load_id filter only. */
  createLoadNumber?: string;
  "data-testid"?: string;
};

export function BillsReverseSection({
  operatingCompanyId,
  filter,
  contextLabel,
  createLoadNumber,
  "data-testid": testId = "bills-reverse",
}: Props) {
  const filterKey = Object.keys(filter)[0] as keyof Filter;
  const filterValue = Object.values(filter)[0] as string;
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [payTarget, setPayTarget] = useState<VendorBill | null>(null);
  const billsQ = useQuery({
    queryKey: ["accounting", "bills", "reverse", operatingCompanyId, filter],
    queryFn: () => listBills(operatingCompanyId, { ...filter, limit: BILLS_REVERSE_LIST_LIMIT }),
    enabled: Boolean(operatingCompanyId) && Boolean(filterValue),
  });
  const rows = billsQ.data?.rows ?? [];

  return (
    <div className="space-y-2 rounded-sm border border-gray-200 bg-white p-3" data-testid={testId}>
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-xs font-semibold text-slate-900">
          Bills
          {rows.length > 0 ? <span className="ml-2 text-xs font-normal text-gray-600">({rows.length})</span> : null}
        </h3>
        <span className="flex items-center gap-3">
          {/* GO-18 (owner correction 2026-09-02, N1 gap) — no bill-creation entry point existed on
              a load surface (BillsReverseSection was read-only). Only the load filter carries a
              create path — mirrors ExpensesReverseSection's own load_id-only restriction. */}
          {filterKey === "load_id" ? (
            <Link
              className="text-xs font-semibold text-slate-700 underline"
              to={`/accounting/bills/vendor?load_id=${encodeURIComponent(filterValue)}${createLoadNumber ? `&load_number=${encodeURIComponent(createLoadNumber)}` : ""}`}
              data-testid="bills-reverse-add-bill"
            >
              + Add Bill
            </Link>
          ) : null}
          <Link
            className="text-xs font-semibold text-slate-700 underline"
            to={`/accounting/bills?${filterKey}=${encodeURIComponent(filterValue)}`}
          >
            Open Bills
          </Link>
        </span>
      </div>
      {billsQ.isLoading ? <p className="text-xs text-gray-500">Loading…</p> : null}
      {billsQ.isError ? <p className="text-xs text-red-600">Could not load bills for {contextLabel}.</p> : null}
      {!billsQ.isLoading && !billsQ.isError && rows.length === 0 ? (
        <p className="text-xs text-gray-500">No bills linked to {contextLabel}.</p>
      ) : null}
      {rows.length > 0 ? (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id} className="text-xs text-slate-700" data-testid={`bill-reverse-${row.id}`}>
              {/* ACCT-F6299-class: 550/16,301 real accounting.bills rows carry bill_number=NULL
                  (live-confirmed, Neon prod) — entityLabel's "Bill — not visible" fallback wrongly
                  claimed a genuinely-visible, correctly-linked bill was unresolved. Same fix as
                  TRAILER-EXPENSE-REVERSE-LABEL-NOT-VISIBLE: visibleDocumentLabel() + a real-field
                  fallback chain. */}
              <EntityLink
                kind="bill"
                id={row.id}
                label={visibleDocumentLabel(row.bill_number ?? row.memo ?? row.vendor_name, row.id, "Bill")}
                className="font-medium"
              />
              <span className="ml-2 text-xs text-gray-500">
                {formatDateUS(row.bill_date)} · {formatMoneyCents(Number(row.amount_cents), "USD")} · {row.status}
                {row.vendor_name || billVendorDrillId(row) ? (
                  <> · <EntityLinkOrTombstone kind="vendor" id={billVendorDrillId(row)} name={row.vendor_name} noun="Vendor" /></>
                ) : null}
              </span>
              {/* GO-23 N1 remainder — "bill-payment create load-scoped". Same disabled-state rule
                  as VendorBalancesPage.tsx's own Pay button: nothing left to pay, or terminal
                  status. load_id filter only, matching + Add Bill's own restriction above. */}
              {filterKey === "load_id" ? (
                <Button
                  size="sm"
                  variant="secondary"
                  className="ml-2"
                  disabled={billRemainingCents(row) <= 0 || row.status === "paid" || row.status === "voided"}
                  onClick={() => setPayTarget(row)}
                  data-testid={`bill-reverse-pay-${row.id}`}
                >
                  Pay
                </Button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
      <CappedListNotice
        shown={rows.length}
        limit={BILLS_REVERSE_LIST_LIMIT}
        total={billsQ.data?.total}
        hint={`Open the full Bills list filtered by ${contextLabel} to see the rest.`}
      />
      <PayBillModal
        open={Boolean(payTarget)}
        operatingCompanyId={operatingCompanyId}
        vendorName={payTarget?.vendor_name ?? "Vendor"}
        bill={payTarget}
        onClose={() => setPayTarget(null)}
        onSaved={() => {
          setPayTarget(null);
          pushToast("Bill payment recorded", "success");
          void queryClient.invalidateQueries({ queryKey: ["accounting", "bills", "reverse", operatingCompanyId, filter] });
        }}
      />
    </div>
  );
}
