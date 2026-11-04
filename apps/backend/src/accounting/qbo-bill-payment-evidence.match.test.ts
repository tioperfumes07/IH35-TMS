import { describe, expect, it } from "vitest";
import {
  buildQboBillPaymentEvidence,
  mapQboBillPayment,
  qboDocMatchesBillNumber,
  toCents,
  vendorNamesAgree,
  type EvidenceAppBill,
  type EvidenceBankLine,
  type EvidenceQboBill,
  type EvidenceQboBillPayment,
} from "./qbo-bill-payment-evidence.match.js";

// Shapes taken from prod 2026-11-04 (QBO payment 1525, Alfonso Hidalgo Chavez, three driver bills).
function appBill(p: Partial<EvidenceAppBill> & { id: string; bill_number: string; amount_cents: number }): EvidenceAppBill {
  return {
    bill_date: "2026-08-14",
    paid_cents: 0,
    vendor_name: "Alfonso Hidalgo Chavez",
    bill_category: "driver",
    driver_bill_id: null,
    settlement_id: null,
    ...p,
  };
}
const qboBills: EvidenceQboBill[] = [
  { id: "q506", doc_number: "13506-5775", vendor_name: "Alfonso Hidalgo Chavez", txn_date: "2026-08-14", total_cents: 55658, balance_cents: 0 },
  { id: "q514", doc_number: "13514-5775-USMCA-005", vendor_name: "Alfonso Hidalgo Chavez", txn_date: "2026-08-14", total_cents: 59308, balance_cents: 0 },
  { id: "q516", doc_number: "13516-5775-USMCA-011", vendor_name: "Alfonso Hidalgo Chavez", txn_date: "2026-08-14", total_cents: 3674, balance_cents: 0 },
];
const payment: EvidenceQboBillPayment = {
  id: "p1525",
  doc_number: "1525",
  vendor_name: "Alfonso Hidalgo Chavez",
  txn_date: "2026-08-13",
  total_cents: 118640,
  pay_type: "Check",
  bank_account_qbo_id: "1150040143",
  lines: [
    { amount_cents: 3674, bill_ids: ["q516"] },
    { amount_cents: 59308, bill_ids: ["q514"] },
    { amount_cents: 55658, bill_ids: ["q506"] },
  ],
};
const bills = [
  appBill({ id: "a506", bill_number: "13506", amount_cents: 58158, paid_cents: 2500 }),
  appBill({ id: "a514", bill_number: "13514", amount_cents: 61808, paid_cents: 2500 }),
  appBill({ id: "a516", bill_number: "13516", amount_cents: 21974, paid_cents: 18300 }),
];
const bankLine: EvidenceBankLine = {
  id: "bk1", bank_account_id: "ba", transaction_date: "2026-08-14", amount_cents: -118640, description: "Zelle", status: "uncategorized",
};

describe("ACCT-F11104 QBO bill-payment evidence matcher", () => {
  it("matches a QBO driver bill net of the app's non-cash deductions and marks a 1:1:1 row postable", () => {
    const out = buildQboBillPaymentEvidence({ appBills: bills, qboBills, qboBillPayments: [payment], bankLines: [bankLine] });
    expect(out.totals.exact_unique.count).toBe(3);
    expect(out.totals.postable.count).toBe(3);
    expect(out.totals.postable.open_cents).toBe(118640);
    expect(out.rows.every((r) => r.bank_status === "unique" && r.bank_line_ids[0] === "bk1")).toBe(true);
  });

  it("is never postable without a unique bank line", () => {
    const none = buildQboBillPaymentEvidence({ appBills: bills, qboBills, qboBillPayments: [payment], bankLines: [] });
    expect(none.totals.exact_unique.count).toBe(3);
    expect(none.totals.postable.count).toBe(0);
    expect(none.rows[0]!.bank_status).toBe("none");
    const two = buildQboBillPaymentEvidence({
      appBills: bills, qboBills, qboBillPayments: [payment], bankLines: [bankLine, { ...bankLine, id: "bk2" }],
    });
    expect(two.totals.postable.count).toBe(0);
    expect(two.rows[0]!.bank_status).toBe("multiple");
  });

  it("is not postable when the payment also settles a bill the app cannot match", () => {
    const out = buildQboBillPaymentEvidence({
      appBills: bills.slice(0, 2), qboBills, qboBillPayments: [payment], bankLines: [bankLine],
    });
    expect(out.totals.exact_unique.count).toBe(2);
    expect(out.totals.postable.count).toBe(0);
    expect(out.rows[0]!.qbo_payment_fully_mapped).toBe(false);
  });

  it("flags pre-cutover app bills and ignores pre-cutover QBO activity", () => {
    const old = appBill({ id: "old", bill_number: "13400", amount_cents: 1000, bill_date: "2026-08-06" });
    const preQbo: EvidenceQboBill = { id: "qold", doc_number: "13401-5700", vendor_name: "Alfonso Hidalgo Chavez", txn_date: "2026-08-06", total_cents: 2000, balance_cents: 0 };
    const app401 = appBill({ id: "a401", bill_number: "13401", amount_cents: 2000, bill_date: "2026-08-08" });
    const out = buildQboBillPaymentEvidence({ appBills: [old, app401], qboBills: [preQbo], qboBillPayments: [], bankLines: [] });
    expect(out.rows.find((r) => r.app_bill_id === "old")!.group).toBe("pre_cutover_flagged");
    expect(out.rows.find((r) => r.app_bill_id === "a401")!.group).toBe("no_qbo_payment");
    expect(out.qbo_bills_considered).toBe(0);
  });

  it("puts doc+vendor hits with a different amount in ambiguous, and an open QBO bill in no_qbo_payment", () => {
    const wrongAmt = appBill({ id: "w", bill_number: "13506", amount_cents: 99999 });
    const openQ: EvidenceQboBill = { id: "q510", doc_number: "13510-5771", vendor_name: "Jorge Luis Infante Corona", txn_date: "2026-08-12", total_cents: 95400, balance_cents: 95400 };
    const a510 = appBill({ id: "a510", bill_number: "13510", amount_cents: 96400, paid_cents: 1000, vendor_name: "Jorge Luis Infante Corona", bill_date: "2026-08-11" });
    const out = buildQboBillPaymentEvidence({ appBills: [wrongAmt, a510], qboBills: [...qboBills, openQ], qboBillPayments: [], bankLines: [] });
    expect(out.rows.find((r) => r.app_bill_id === "w")!.group).toBe("ambiguous");
    const r510 = out.rows.find((r) => r.app_bill_id === "a510")!;
    expect(r510.group).toBe("no_qbo_payment");
    expect(r510.reason).toBe("qbo_bill_open_unpaid");
  });

  it("normalizes names, doc numbers and cents exactly", () => {
    expect(vendorNamesAgree("Pedro Abraham Lopez Collado", "Pedro Abraham Lopez Collardo")).toBe(true);
    expect(vendorNamesAgree("Angel Alfonso Sosa", "Angel Alfonso Sosa Perez")).toBe(true);
    expect(vendorNamesAgree("Hugo Gaytan", "Hugo Garcia Garcia")).toBe(false);
    expect(qboDocMatchesBillNumber("13512-5772-USMCA-004", "13512")).toBe(true);
    expect(qboDocMatchesBillNumber("135120-1", "13512")).toBe(false);
    expect(toCents("593.08")).toBe(59308);
    expect(toCents(36.74)).toBe(3674);
    expect(toCents("1052")).toBe(105200);
    const mapped = mapQboBillPayment({
      Id: "9", TotalAmt: 10, TxnDate: "2026-08-20", VendorRef: { name: "X Y" },
      Line: [{ Amount: 10, LinkedTxn: [{ TxnId: "b1", TxnType: "Bill" }, { TxnId: "c1", TxnType: "VendorCredit" }] }],
    });
    expect(mapped.lines[0]!.bill_ids).toEqual(["b1"]);
  });
});
