import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllAccounts } from "../../../api/banking";
import type { VendorBill } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { ParityDrawer } from "../../../components/parity/ParityDrawer";
import { DatePicker } from "../../../components/forms/DatePicker";
import { MoneyInput } from "../../../components/forms/MoneyInput";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCCPayment } from "../../../hooks/useCCPayment";
import { companyToday } from "../../../lib/businessDate";
import { ListErrorBanner } from "../../../components/shared/ListErrorBanner";

// FINANCIAL GATE (orphan-triage F1): /api/v1/bill-payments/cc posts directly to
// accounting.bill_payments + accounting.bills (money-moving) and had zero prior UI consumer
// anywhere in the app (verified: useCCPayment/submitCcBillPayment were unused before this PR).
// Per constitution §1.4 there is no EXISTING gated/wired poster for this exact action to reuse,
// so the form renders fully but submit stays disabled until Jorge gives an explicit per-block OK
// (same pattern as NewAccountDrawerForm's ACCOUNT_CREATE_GATED). Flip to false only on that OK.
const CC_BILL_PAYMENT_GATED = true;

type Props = { open: boolean; operatingCompanyId: string; bill: VendorBill | null; onClose: () => void; onSaved: () => void };

export function CCPaymentModal({ open, operatingCompanyId, bill, onClose, onSaved }: Props) {
  const [ccAccountId, setCcAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => companyToday());
  const [amountDollars, setAmountDollars] = useState("0");
  const ccPayment = useCCPayment(operatingCompanyId);
  const accountsQuery = useQuery({ queryKey: ["cc-accounts", operatingCompanyId], queryFn: () => getAllAccounts(operatingCompanyId), enabled: open });
  const ccAccounts = useMemo(() => (accountsQuery.data?.accounts ?? []).filter((a) => String(a.account_type ?? "").includes("credit")), [accountsQuery.data]);
  useEffect(() => {
    if (!open || !bill) return;
    setCcAccountId(String(ccAccounts[0]?.id ?? ""));
    setAmountDollars(String(Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0)) / 100));
  }, [open, bill, ccAccounts]);
  if (!bill) return null;
  return (
    <ParityDrawer
      open={open}
      onClose={onClose}
      title="Pay with CC"
      size="wide"
      footer={
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="submit"
            form="cc-bill-payment-form"
            disabled={CC_BILL_PAYMENT_GATED}
            title={CC_BILL_PAYMENT_GATED ? "Pay with CC awaiting financial approval" : undefined}
          >
            {CC_BILL_PAYMENT_GATED ? "Awaiting approval" : "Pay with CC"}
          </Button>
        </div>
      }
    >
      <form
        id="cc-bill-payment-form"
        className="space-y-2"
        data-testid="cc-bill-payment-drawer"
        onSubmit={async (e) => {
          e.preventDefault();
          if (CC_BILL_PAYMENT_GATED) return;
          await ccPayment.mutateAsync({
            bill_id: bill.id,
            cc_account_id: ccAccountId,
            payment_amount_cents: Math.round(Number(amountDollars) * 100),
            payment_date: paymentDate,
          });
          onSaved();
          onClose();
        }}
      >
        {accountsQuery.isError ? (
          <ListErrorBanner
            message={`Failed to load credit-card accounts: ${(accountsQuery.error as Error)?.message ?? "Request failed"}`}
            onRetry={() => void accountsQuery.refetch()}
          />
        ) : null}
        {/* Banking.bank_accounts (credit) — not CoA; SelectCombobox intentional */}
        <SelectCombobox
          value={ccAccountId}
          onChange={(e) => setCcAccountId(e.target.value)}
          className="h-9 w-full rounded-sm border px-2 text-[13px]"
        >
          <option value="">CC account</option>
          {ccAccounts.map((a) => (
            <option key={String(a.id)} value={String(a.id)}>
              {String(a.display_name ?? a.id)}
            </option>
          ))}
        </SelectCombobox>
        {/* M-1: dollars-mode; Math.round(amountDollars*100)=payment_amount_cents byte-for-byte. */}
        <MoneyInput
          valueDollars={amountDollars ? Number(amountDollars) : null}
          onChangeDollars={(d) => setAmountDollars(d == null ? "" : String(d))}
          ariaLabel="Payment amount (USD)"
          className="w-full"
        />
        <DatePicker className="h-9 w-full rounded-sm border px-2 text-[13px]" value={paymentDate} onChange={setPaymentDate} />
        {CC_BILL_PAYMENT_GATED ? (
          <div className="rounded-sm border border-slate-300 bg-slate-50 px-3 py-2 text-xs text-slate-800">
            <span className="font-semibold">CC bill payment gated.</span> Submit is disabled pending financial-cluster
            approval. Contact Jorge to enable.
          </div>
        ) : null}
      </form>
    </ParityDrawer>
  );
}
