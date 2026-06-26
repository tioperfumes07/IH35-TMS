import { describe, expect, it } from "vitest";
// self-contained — invoiceJournalBalances from the module under test
import {
  invoiceJournalBalances,
  lumperInvoiceJournal,
  lumperInvoiceLine,
  shouldBillLumperToCustomer,
} from "../lumper-auto-invoice";

const AMT = 30000; // $300 lumper
const CUST = "cust-uuid";

describe("lumper-auto-invoice — STEP 7 (S2 billable line, balanced DR AR / CR QBO-1150040160)", () => {
  it("bills only carrier-paid (S2), suppresses flat-rate, honors per-stop override", () => {
    // S2 itemized customer → bill
    expect(shouldBillLumperToCustomer("carrier_bill", "itemized", null)).toBe(true);
    // S2 flat-rate customer → suppress
    expect(shouldBillLumperToCustomer("carrier_bill", "flat_rate_includes", null)).toBe(false);
    // per-stop override wins: flat-rate customer but stop billable=true → bill
    expect(shouldBillLumperToCustomer("carrier_bill", "flat_rate_includes", true)).toBe(true);
    // per-stop override wins: itemized customer but stop billable=false → suppress
    expect(shouldBillLumperToCustomer("carrier_bill", "itemized", false)).toBe(false);
    // broker / absorb never billed
    expect(shouldBillLumperToCustomer("broker_direct", "itemized", true)).toBe(false);
    expect(shouldBillLumperToCustomer("carrier_absorb", "itemized", true)).toBe(false);
  });

  it("S2 itemized → a $300 invoice line to the customer; JE DR AR/CR QBO-1150040160 balances", () => {
    const line = lumperInvoiceLine("carrier_bill", AMT, CUST, "itemized", null);
    expect(line).not.toBeNull();
    expect(line).toMatchObject({ customer_uuid: CUST, amount_cents: AMT, income_account_ref: "QBO-1150040160" });
    const je = lumperInvoiceJournal(line!);
    expect(invoiceJournalBalances(je)).toBe(true); // DR $300 = CR $300
    expect(je.find((l) => l.side === "debit")?.account_ref).toBe("AR");
    expect(je.find((l) => l.side === "credit")?.account_ref).toBe("QBO-1150040160");
    expect(je.find((l) => l.side === "credit")?.amount_cents).toBe(AMT);
  });

  it("S2 FLAT-RATE customer → NO invoice line (suppressed; cost-only)", () => {
    expect(lumperInvoiceLine("carrier_bill", AMT, CUST, "flat_rate_includes", null)).toBeNull();
  });

  it("S2 stop flat-rate override → NO invoice line even for an itemized customer", () => {
    expect(lumperInvoiceLine("carrier_bill", AMT, CUST, "itemized", false)).toBeNull();
  });

  it("S1 broker / S3 absorb → NO invoice line", () => {
    expect(lumperInvoiceLine("broker_direct", AMT, CUST, "itemized", true)).toBeNull();
    expect(lumperInvoiceLine("carrier_absorb", AMT, CUST, "itemized", true)).toBeNull();
  });

  it("no customer or zero/garbage amount → NO invoice line", () => {
    expect(lumperInvoiceLine("carrier_bill", AMT, null, "itemized", null)).toBeNull();
    expect(lumperInvoiceLine("carrier_bill", 0, CUST, "itemized", null)).toBeNull();
    expect(lumperInvoiceLine("carrier_bill", -5, CUST, "itemized", null)).toBeNull();
  });
});
