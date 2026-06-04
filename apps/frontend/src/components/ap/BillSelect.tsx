import { useQuery } from "@tanstack/react-query";
import { listVendorBills, type VendorBill } from "../../api/accounting";
import { SelectCombobox } from "../shared/SelectCombobox";

type Props = {
  operatingCompanyId: string;
  vendorId: string;
  value: string | null;
  onChange: (billId: string | null, bill: VendorBill | null) => void;
  disabled?: boolean;
};

export function BillSelect({ operatingCompanyId, vendorId, value, onChange, disabled }: Props) {
  const billsQuery = useQuery({
    queryKey: ["ap-bill-select", operatingCompanyId, vendorId],
    queryFn: () =>
      listVendorBills(operatingCompanyId, { vendor_id: vendorId, has_balance: true, limit: 200 }).then((res) => res.rows ?? []),
    enabled: Boolean(operatingCompanyId && vendorId),
  });

  const bills = (billsQuery.data ?? []).filter(
    (bill) => Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0)) > 0
  );
  const placeholder = billsQuery.isLoading ? "Loading bills…" : "Select open bill";

  return (
    <div>
      <label className="mb-1 block text-xs font-semibold text-gray-600">Bill with balance</label>
      <SelectCombobox
        disabled={disabled || billsQuery.isLoading}
        value={value ?? ""}
        onChange={(event) => {
          const next = event.target.value;
          const bill = bills.find((row) => row.id === next) ?? null;
          onChange(next || null, bill);
        }}
        className="w-full rounded border border-gray-300 px-2 py-1 text-sm"
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {bills.map((bill) => {
          const remaining = Math.max(0, Number(bill.amount_cents ?? 0) - Number(bill.paid_cents ?? 0));
          const label = `${bill.bill_number ?? bill.id.slice(0, 8)} · ${(remaining / 100).toLocaleString(undefined, { style: "currency", currency: "USD" })} due`;
          return (
            <option key={bill.id} value={bill.id}>
              {label}
            </option>
          );
        })}
      </SelectCombobox>
    </div>
  );
}
