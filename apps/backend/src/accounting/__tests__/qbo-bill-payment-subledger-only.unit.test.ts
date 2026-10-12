/**
 * R443.117 9a builder contract plus retained transitional 9b payBill assertions.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const enginePath = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const billsPath = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");

describe("native bill-payment GL builder and transitional payBill contract", () => {
  const engine = fs.readFileSync(enginePath, "utf8");
  const bills = fs.readFileSync(billsPath, "utf8");

  it("does not refuse the native BillPayment GL builder based on QBO bill origin", () => {
    const start = engine.indexOf("async function buildBillPaymentLines(");
    const end = engine.indexOf("\nasync function ", start + 1);
    const builder = engine.slice(start, end < 0 ? undefined : end);
    expect(builder).not.toContain("QBO_BILL_PAYMENT_POST_GL_REFUSED");
    expect(builder).not.toMatch(/\.source_system\b/);
    expect(builder).toContain("getPostingBySource");
    expect(builder).toContain("BILL_AP_NOT_POSTED");
    expect(builder).toContain("settlement_deduction_noncash");
  });

  it("retains the 9b payBill QBO skip until its separate caller-path change", () => {
    expect(bills).toContain("qbo_parallel_books");
    expect(bills).toMatch(/if\s*\(\s*(?:flags\.)?glPostingEnabled\s*\)\s*\{[\s\S]*?if\s*\(\s*!isQboBill(?:\s*&&[^)]*)?\s*\)\s*\{[\s\S]*?postSourceTransactionInClientTx/);
  });
});
