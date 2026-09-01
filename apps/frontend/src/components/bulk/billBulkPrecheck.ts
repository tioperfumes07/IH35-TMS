import type { VendorBill } from "../../api/accounting";
import type { BulkPrecheckRow } from "./bulkClientPrecheck";
import { billBulkRowLabel } from "./bulkRowLabels";

export function billBulkPrecheckRows(bills: VendorBill[]): BulkPrecheckRow[] {
  return bills.map((bill) => {
    let blockedReason: string | null = null;
    if (bill.status === "voided") blockedReason = "Bill is already void";
    else if (Number(bill.paid_cents ?? 0) > 0) {
      blockedReason = "Bill has payments — void payments first";
    }
    return {
      id: bill.id,
      label: billBulkRowLabel(bill),
      blockedReason,
    };
  });
}
