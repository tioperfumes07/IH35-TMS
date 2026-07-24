/**
 * Parallel books: QBO bill Pay Bill must not invent a TMS JE / must not roll back subledger.
 */
import { describe, expect, it } from "vitest";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../../../../");
const enginePath = path.join(ROOT, "apps/backend/src/accounting/posting-engine.service.ts");
const billsPath = path.join(ROOT, "apps/backend/src/accounting/bills.service.ts");

describe("QBO bill payment subledger-only (static contract)", () => {
  const engine = fs.readFileSync(enginePath, "utf8");
  const bills = fs.readFileSync(billsPath, "utf8");

  it("refuses BillPayment→GL for source_system=qbo", () => {
    expect(engine).toContain('"QBO_BILL_PAYMENT_POST_GL_REFUSED"');
    expect(engine).toMatch(/source_system[\s\S]{0,120}qbo[\s\S]{0,220}QBO_BILL_PAYMENT_POST_GL_REFUSED/);
  });

  it("payBill skips GL for QBO bills and reports qbo_parallel_books", () => {
    expect(bills).toContain("qbo_parallel_books");
    expect(bills).toMatch(/if\s*\(\s*glPostingEnabled\s*\)\s*\{[\s\S]*?if\s*\(\s*!isQboBill\s*\)\s*\{[\s\S]*?postSourceTransactionInClientTx/);
  });
});
