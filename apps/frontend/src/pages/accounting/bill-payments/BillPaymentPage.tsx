import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { listBills } from "../../../api/accounting";
import { useCompanyContext } from "../../../contexts/CompanyContext";
import { Button } from "../../../components/Button";
import { SelectCombobox } from "../../../components/shared/SelectCombobox";
import { AccountingSubNavWrapper } from "../AccountingSubNavWrapper";
import { PayBillModal } from "../PayBillModal";
import { CCPaymentModal } from "./CCPaymentModal";

export function BillPaymentPage() {
  const { selectedCompanyId } = useCompanyContext();
  const companyId = selectedCompanyId ?? "";
  const [selectedBillId, setSelectedBillId] = useState("");
  const [payOpen, setPayOpen] = useState(false);
  const [ccOpen, setCcOpen] = useState(false);
  const billsQuery = useQuery({ queryKey: ["bills-unpaid", companyId], queryFn: () => listBills(companyId, { status: "unpaid", include_balance: true, limit: 200 }), enabled: Boolean(companyId) });
  const selectedBill = useMemo(() => (billsQuery.data?.rows ?? []).find((b) => b.id === selectedBillId) ?? null, [selectedBillId, billsQuery.data]);
  return (
    <AccountingSubNavWrapper
      title="Bill Payments"
      subtitle="Vendor bill payments"
      actions={
        <div className="flex gap-2">
          <Button variant="secondary" disabled={!selectedBill} onClick={() => setPayOpen(true)}>Record payment</Button>
          <Button disabled={!selectedBill} onClick={() => setCcOpen(true)}>Pay with CC</Button>
        </div>
      }
    >
      <SelectCombobox className="h-9 max-w-xl rounded border px-2 text-[13px]" value={selectedBillId} onChange={(e) => setSelectedBillId(e.target.value)}>
        <option value="">Select bill</option>
        {(billsQuery.data?.rows ?? []).map((b) => <option key={b.id} value={b.id}>{b.bill_number || b.id}</option>)}
      </SelectCombobox>
      <PayBillModal open={payOpen} operatingCompanyId={companyId} vendorName={selectedBill?.vendor_name || "Vendor"} bill={selectedBill} onClose={() => setPayOpen(false)} onSaved={() => { setPayOpen(false); void billsQuery.refetch(); }} />
      <CCPaymentModal open={ccOpen} operatingCompanyId={companyId} bill={selectedBill} onClose={() => setCcOpen(false)} onSaved={() => void billsQuery.refetch()} />
    </AccountingSubNavWrapper>
  );
}
