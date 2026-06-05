import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getAllAccounts } from "../../../api/banking";
import type { VendorBill } from "../../../api/accounting";
import { Button } from "../../../components/Button";
import { Modal } from "../../../components/Modal";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { useCCPayment } from "../../../hooks/useCCPayment";

type Props = { open: boolean; operatingCompanyId: string; bill: VendorBill | null; onClose: () => void; onSaved: () => void };

export function CCPaymentModal({ open, operatingCompanyId, bill, onClose, onSaved }: Props) {
  const [ccAccountId, setCcAccountId] = useState("");
  const [paymentDate, setPaymentDate] = useState(() => new Date().toISOString().slice(0, 10));
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
    <Modal open={open} onClose={onClose} title="Pay with CC">
      <form className="space-y-2" onSubmit={async (e) => {
        e.preventDefault();
        await ccPayment.mutateAsync({ bill_id: bill.id, cc_account_id: ccAccountId, payment_amount_cents: Math.round(Number(amountDollars) * 100), payment_date: paymentDate });
        onSaved(); onClose();
      }}>
        <SelectCombobox value={ccAccountId} onChange={(e) => setCcAccountId(e.target.value)} className="h-9 w-full rounded border px-2 text-[13px]">
          <option value="">CC account</option>
          {ccAccounts.map((a) => <option key={String(a.id)} value={String(a.id)}>{String(a.display_name ?? a.id)}</option>)}
        </SelectCombobox>
        <input className="h-9 w-full rounded border px-2 text-[13px]" value={amountDollars} onChange={(e) => setAmountDollars(e.target.value)} />
        <input type="date" className="h-9 w-full rounded border px-2 text-[13px]" value={paymentDate} onChange={(e) => setPaymentDate(e.target.value)} />
        <Button type="submit">Pay with CC</Button>
      </form>
    </Modal>
  );
}
