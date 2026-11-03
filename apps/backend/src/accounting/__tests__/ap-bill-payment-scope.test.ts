/**
 * Row 23 (ACCT-F11057) — a "bill payment" on every list is a payment applied to an A/P bill, never a settlement
 * deduction (driver escrow contribution / advance recovery / other recovery). Locks the shared predicate and that
 * every bill-payment LIST reader uses it.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { apBillPaymentOnlySql } from "../ap-bill-payment-scope.sql.js";

const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

describe("apBillPaymentOnlySql", () => {
  it("excludes settlement deductions and requires an A/P bill in the same company", () => {
    const sql = apBillPaymentOnlySql("bp");
    expect(sql).toContain("bp.settlement_deduction_noncash IS NOT TRUE");
    expect(sql).toContain("bp.bill_id IS NOT NULL");
    expect(sql).toContain("FROM accounting.bills ap_bill");
    expect(sql).toContain("ap_bill.operating_company_id = bp.operating_company_id");
  });

  it("never interpolates an unsafe alias", () => {
    expect(apBillPaymentOnlySql("x; DROP TABLE y")).toContain("bp.settlement_deduction_noncash");
    expect(apBillPaymentOnlySql("pay")).toContain("pay.bill_id IS NOT NULL");
  });

  it("every bill-payment list reader applies it", () => {
    const listReader = read("../bills.service.ts");
    const start = listReader.indexOf("export async function listBillPayments(");
    expect(start).toBeGreaterThan(-1);
    expect(listReader.slice(start, start + 2500)).toContain('apBillPaymentOnlySql("bp")');
    expect(read("../vendor-bill-payments.routes.ts")).toMatch(/AND \$\{apBillPaymentOnlySql\("bp"\)\}/);
    expect(read("../../mdata/canonical/vendor-profile.service.ts")).toMatch(/AND \$\{apBillPaymentOnlySql\("bp"\)\}/);
  });

  it("the per-bill drill-through keeps settlement deductions (they are applications on that bill)", () => {
    const src = read("../bills.service.ts");
    const start = src.indexOf("export async function listBillPaymentsForBill(");
    const end = src.indexOf("export async function", start + 10);
    expect(src.slice(start, end)).not.toContain("apBillPaymentOnlySql");
  });
});
