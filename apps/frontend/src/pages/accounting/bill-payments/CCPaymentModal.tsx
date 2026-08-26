import { useEffect, useMemo, useState } from "react";
import { entityLabel, visibleDocumentLabel } from "../../../lib/entity-label";
import { useQuery } from "@tanstack/react-query";
import { listCatalogAccounts } from "../../../api/catalog-accounts";
import type { VendorBill } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { EntityLink } from "../../../components/shared/EntityLink";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { ReferenceSelect } from "../../../components/parity/ReferenceSelect";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { useCCPayment } from "../../../hooks/useCCPayment";
import { companyToday } from "../../../lib/businessDate";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

// FINANCIAL GATE (orphan-triage F1): /api/v1/bill-payments/cc posts to
// accounting.bill_payments + accounting.bills (money-moving).
// Owner GO 2026-07-22: flip for ALL operating companies — "everything should be working,
// it has already been stated, so flip flags on all companies."
const CC_BILL_PAYMENT_GATED = false;

type Props = {
  open: boolean;
  operatingCompanyId: string;
  bill: VendorBill | null;
  onClose: () => void;
  onSaved: () => void;
};

function money(cents: number) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD" }).format((Number(cents) || 0) / 100);
}

export function CCPaymentModal({ open, operatingCompanyId, bill, onClose, onSaved }: Props) {
  const [ccAccountId, setCcAccountId] = useState<string | null>(null);
  const [paymentDate, setPaymentDate] = useState(() => companyToday());
  const [amountCents, setAmountCents] = useState<number | null>(0);
  const [memo, setMemo] = useState("");
  const [error, setError] = useState<string | null>(null);
  const ccPayment = useCCPayment(operatingCompanyId);

  const accountsQuery = useQuery({
    queryKey: ["cc-bill-payment", "liability-accounts", operatingCompanyId],
    // LST-F14: CC payment account picker — server-side is_postable=true.
    queryFn: () =>
      listCatalogAccounts({
        status: "active",
        operating_company_id: operatingCompanyId,
        postable_only: true,
      }),
    enabled: open && Boolean(operatingCompanyId),
    staleTime: 60_000,
  });

  const ccAccountOptions = useMemo(
    () =>
      (accountsQuery.data?.accounts ?? [])
        .filter(
          (acct) =>
            acct.is_postable &&
            !acct.deactivated_at &&
            (acct.account_type === "Liability" ||
              String(acct.account_subtype ?? "").toLowerCase().includes("credit") ||
              String(acct.account_name ?? "").toLowerCase().includes("credit card") ||
              String(acct.account_type ?? "").toLowerCase().includes("credit"))
        )
        .map((acct) => ({
          value: acct.id,
          label: acct.account_name,
          type: acct.account_type ?? undefined,
        })),
    [accountsQuery.data?.accounts]
  );

  const remainingCents = useMemo(() => {
    if (!bill) return 0;
    return Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
  }, [bill]);

  useEffect(() => {
    if (!open || !bill) return;
    setCcAccountId(ccAccountOptions[0]?.value ?? null);
    setPaymentDate(companyToday());
    setAmountCents(remainingCents);
    setMemo("");
    setError(null);
  }, [open, bill, remainingCents, ccAccountOptions]);

  const payAmountCents = amountCents ?? 0;

  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Pay with CC"
      size="wide"
      footer={
        bill ? (
          <div className="flex justify-end gap-2">
            <Button type="button" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              type="submit"
              form="cc-bill-payment-form"
              disabled={CC_BILL_PAYMENT_GATED || ccPayment.isPending}
              title={CC_BILL_PAYMENT_GATED ? "Pay with CC awaiting financial approval" : undefined}
            >
              {CC_BILL_PAYMENT_GATED ? "Awaiting approval" : ccPayment.isPending ? "Paying…" : "Pay with CC"}
            </Button>
          </div>
        ) : undefined
      }
    >
      {!bill ? (
        <div className="text-sm text-gray-600">No bill selected.</div>
      ) : (
        <form
          id="cc-bill-payment-form"
          className="space-y-3"
          data-testid="cc-bill-payment-drawer"
          onSubmit={async (event) => {
            event.preventDefault();
            if (CC_BILL_PAYMENT_GATED) return;
            setError(null);
            if (payAmountCents <= 0) {
              setError("Payment amount must be greater than zero.");
              return;
            }
            if (payAmountCents > remainingCents) {
              setError("Payment amount cannot exceed remaining bill balance.");
              return;
            }
            if (!ccAccountId) {
              setError("Credit card liability account is required.");
              return;
            }
            try {
              await ccPayment.mutateAsync({
                bill_id: bill.id,
                cc_account_id: ccAccountId,
                payment_amount_cents: payAmountCents,
                payment_date: paymentDate,
                memo: memo.trim() || undefined,
              });
              onSaved();
              onClose();
            } catch (submitError) {
              setError(submitError instanceof Error ? submitError.message : "Failed to submit CC payment.");
            }
          }}
        >
          {error ? (
            <div className="rounded-sm border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">{error}</div>
          ) : null}
          {accountsQuery.isError ? (
            <ListErrorBanner
              message={`Failed to load credit-card accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
              onRetry={() => void accountsQuery.refetch()}
            />
          ) : null}

          {/* CHROME: flat sections — no nested bordered panel inside the drawer (box-in-box) */}
          <div className="text-xs font-semibold uppercase tracking-wide text-slate-700">CC Bill Payment Details</div>

          <div className="grid grid-cols-1 gap-2 md:grid-cols-6">
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Vendor
              <input
                value={entityLabel(bill.vendor_name, bill.vendor_id, "Vendor")}
                readOnly
                className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Bill #
              {/* LINK-F5188: bill.id is real (used at submission time below) but this field only
                  ever rendered it as disabled plain text -- same pattern PayBillModal.tsx already
                  uses for the same kind of bill via ACH/check/wire. */}
              <div className="flex h-9 items-center rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]">
                <EntityLink kind="bill" id={bill.id} label={visibleDocumentLabel(bill.bill_number, bill.id, "Bill")} />
              </div>
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Payment date
              <DatePicker value={paymentDate} onChange={setPaymentDate} className="" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Payment amount (USD)
              <MoneyInput valueCents={amountCents} onChangeCents={setAmountCents} ariaLabel="Payment amount" />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600">
              Remaining
              <input
                value={money(remainingCents)}
                readOnly
                className="h-9 rounded-sm border border-gray-300 bg-gray-100 px-2 text-[13px]"
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-2">
              Credit card liability account
              <ReferenceSelect
                value={ccAccountId}
                onChange={setCcAccountId}
                options={ccAccountOptions}
                createKind="account"
                addNewLabel="+ Add new account"
                operatingCompanyId={operatingCompanyId}
                placeholder="Select credit card account…"
                disabled={!operatingCompanyId}
              />
            </label>
            <label className="flex flex-col gap-1 text-xs font-semibold text-gray-600 md:col-span-6">
              Memo
              <textarea
                rows={3}
                value={memo}
                onChange={(event) => setMemo(event.target.value)}
                className="rounded-sm border border-gray-300 px-2 py-1.5 text-[13px]"
              />
            </label>
          </div>

          {CC_BILL_PAYMENT_GATED ? (
            <div className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800">
              <span className="font-semibold">CC bill payment gated.</span> Submit is disabled pending financial-cluster
              approval. Contact Jorge to enable.
            </div>
          ) : null}
        </form>
      )}
    </ParityDrawer>
  );
}
