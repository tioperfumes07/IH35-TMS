/**
 * Lumper Lifecycle STEP 7 — auto-invoice the billable lumper line on load close.
 *
 * When a we-pay lumper is billable to the customer (scenario 2, customer/stop NOT flat-rate), load close
 * (WF-040) appends a lumper line to the customer invoice from accounting.expense_lines.billable_customer_uuid
 * — the same path accessorials take to the invoice/QBO outbox. The customer-invoice posting is
 * DR Accounts Receivable / CR QBO-1150040160 (Lumper Reimbursement Income), which offsets the expense leg
 * (DR QBO-117 / CR Bank from disburse) to a ~$0 passthrough. Suppressed for a flat-rate customer or a
 * flat-rate (lumper_billable=false) stop: the cost is booked but NOT separately billed. Pure + unit-tested;
 * the live invoice append is behind LUMPER_LIFECYCLE_ENABLED.
 */

// Self-contained (STEP 4's lumper-posting-rules is a sibling HOLD PR; keep each PR compiling on main).
export const LUMPER_INCOME_ACCOUNT = "QBO-1150040160" as const;
export type JeLeg = { account_ref: string; side: "debit" | "credit"; amount_cents: number; memo: string };

/** Double-entry invariant for the invoice JE: sum(debits) === sum(credits). */
export function invoiceJournalBalances(legs: readonly JeLeg[]): boolean {
  const dr = legs.filter((l) => l.side === "debit").reduce((a, l) => a + l.amount_cents, 0);
  const cr = legs.filter((l) => l.side === "credit").reduce((a, l) => a + l.amount_cents, 0);
  return dr === cr;
}

export type LumperInvoiceScenario = "broker_direct" | "carrier_bill" | "carrier_absorb";
export type CustomerLumperBillingMode = "itemized" | "flat_rate_includes";

/**
 * Should this lumper be billed to the customer as its own invoice line?
 * Only a carrier-paid (S2) lumper is ever billable. The per-stop lumper_billable override wins when set
 * (true=bill / false=suppress); otherwise it follows the customer's billing mode (itemized=bill,
 * flat_rate_includes=suppress). Broker/absorb are never billed.
 */
export function shouldBillLumperToCustomer(
  scenario: LumperInvoiceScenario,
  customerBillingMode: CustomerLumperBillingMode | null | undefined,
  stopLumperBillable: boolean | null | undefined,
): boolean {
  if (scenario !== "carrier_bill") return false;
  if (stopLumperBillable === true) return true;
  if (stopLumperBillable === false) return false;
  return customerBillingMode !== "flat_rate_includes";
}

export type LumperInvoiceLine = {
  customer_uuid: string;
  amount_cents: number;
  income_account_ref: string; // CR — QBO-1150040160
  description: string;
};

/**
 * The customer-invoice line for a billable lumper, or null when suppressed / not billable / no customer.
 * Negative/garbage amounts clamp to no line.
 */
export function lumperInvoiceLine(
  scenario: LumperInvoiceScenario,
  amountCents: number,
  billableCustomerUuid: string | null | undefined,
  customerBillingMode: CustomerLumperBillingMode | null | undefined,
  stopLumperBillable: boolean | null | undefined,
): LumperInvoiceLine | null {
  const amt = Math.max(0, Math.trunc(Number(amountCents) || 0));
  if (amt === 0) return null;
  if (!billableCustomerUuid) return null;
  if (!shouldBillLumperToCustomer(scenario, customerBillingMode, stopLumperBillable)) return null;
  return {
    customer_uuid: billableCustomerUuid,
    amount_cents: amt,
    income_account_ref: LUMPER_INCOME_ACCOUNT,
    description: "Lumper fee (reimbursable)",
  };
}

/** The JE for the invoice line: DR AR / CR QBO-1150040160. Balanced by construction. */
export function lumperInvoiceJournal(line: LumperInvoiceLine, arAccountRef = "AR"): JeLeg[] {
  return [
    { account_ref: arAccountRef, side: "debit", amount_cents: line.amount_cents, memo: "Lumper billed to customer (AR)" },
    { account_ref: line.income_account_ref, side: "credit", amount_cents: line.amount_cents, memo: "Lumper reimbursement income" },
  ];
}
