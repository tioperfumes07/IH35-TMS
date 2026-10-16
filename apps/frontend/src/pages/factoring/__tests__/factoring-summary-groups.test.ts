// LEAD 443.174 — Summary is a different view from Detail: grouped rows, totals that tie to the detail rows.
import { describe, expect, it } from "vitest";
import { groupAgingByDebtor, groupChargebacksByCustomer } from "../factoring-summary-groups";
import { paymentsToYouByMonth } from "../PaymentsToYouPanel";

describe("443.174 factoring Summary views", () => {
  it("aging Summary = one row per debtor; buckets and balance tie to the invoice rows", () => {
    const rows = [
      { customer_id: "c1", customer_name: "ACE DORAN LLC", invoice_amount: 4450, bucket: "0-30" as const },
      { customer_id: "c1", customer_name: "ACE DORAN LLC", invoice_amount: 5200, bucket: "31-60" as const },
      { customer_id: "c2", customer_name: "Refrigerx", invoice_amount: 3900, bucket: "90+" as const },
    ];
    const g = groupAgingByDebtor(rows);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ customer_name: "ACE DORAN LLC", invoices: 2, b0_30: 4450, b31_60: 5200, balance: 9650 });
    expect(g.reduce((t, r) => t + r.balance, 0)).toBe(rows.reduce((t, r) => t + r.invoice_amount, 0));
  });

  it("chargebacks Summary = one row per customer", () => {
    const g = groupChargebacksByCustomer([
      { customer_id: "c1", customer_name: "A", chargeback_amount: 100, factor_fee_amount: 5 },
      { customer_id: "c1", customer_name: "A", chargeback_amount: 50, factor_fee_amount: 1 },
      { customer_id: null, customer_name: null, chargeback_amount: 7, factor_fee_amount: 0 },
    ] as never);
    expect(g).toHaveLength(2);
    expect(g[0]).toMatchObject({ customer_name: "A", records: 2, chargebacks: 150, fees: 6 });
    expect(g[1]!.customer_name).toBe("No customer linked");
  });

  it("payments to you Summary = one row per wire month; net ties to the purchases", () => {
    const p = (id: string, wire: string, net: number) => ({ id, wire_date: wire, purchase_date: wire, invoice_count: 2, gross_cents: net + 300, fee_cents: 100, wire_fee_cents: 0, escrow_reserve_cents: 200, cash_reserve_cents: 0, net_to_company_cents: net });
    const m = paymentsToYouByMonth([p("a", "2026-09-04", 1000), p("b", "2026-09-28", 2000), p("c", "2026-10-02", 500)] as never);
    expect(m.map((r) => r.month)).toEqual(["2026-09", "2026-10"]);
    expect(m[0]).toMatchObject({ wires: 2, invoices: 4, net_to_company_cents: 3000, fees_cents: 200 });
  });
});
