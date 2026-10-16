/**
 * LEAD 443.168 K (E-47) — fail-old: on main nothing raises the misdirected-payment alert when a customer payment on a
 * Faro-purchased invoice is matched. Synthetic ids only.
 */
import { describe, expect, it, vi } from "vitest";
import { misdirectedForwardByDate, raiseMisdirectedPaymentAlerts } from "../misdirected-payment-alert.service.js";

describe("misdirectedForwardByDate — 1 business day", () => {
  it.each([
    ["2026-10-14", "2026-10-15"], // Wed → Thu
    ["2026-10-16", "2026-10-19"], // Fri → Mon
    ["2026-10-17", "2026-10-19"], // Sat → Mon
    ["2026-10-09", "2026-10-13"], // Fri → Tue (Mon 10-12 Columbus Day)
    ["2026-12-24", "2026-12-28"], // Thu → Mon (Fri 12-25 holiday)
  ])("%s → %s", (received, due) => expect(misdirectedForwardByDate(received)).toBe(due));
});

function client(line: { is_credit: boolean } | null, hits: Array<Record<string, string | null>>) {
  const calls: Array<[string, unknown[]]> = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    calls.push([sql, values]);
    if (/FROM banking\.bank_transactions/.test(sql)) return { rows: line ? [{ transaction_date: "2026-10-16", is_credit: line.is_credit, amount_cents: "150000" }] : [] };
    if (/FROM docs d/.test(sql)) return { rows: hits };
    if (/INSERT INTO accounting\.factoring_misdirected_payment_alerts/.test(sql)) return { rows: [], rowCount: 1 };
    return { rows: [] };
  });
  return { query, calls };
}
const hit = { invoice_id: "inv-1", cents: "150000", customer_id: "cus-1", purchase_line_id: "pl-1", purchase_id: "fp-1", factor_vendor_id: "v-faro", gross_cents: "150000" };
const base = { operating_company_id: "co", bank_transaction_id: "bt-1", ledger_entry_kind: "payment", ledger_entry_id: "pay-1", actor_user_uuid: "u-1" };

describe("raiseMisdirectedPaymentAlerts", () => {
  it("a payment on a purchased invoice raises one alert due the next business day, and posts nothing", async () => {
    const c = client({ is_credit: true }, [hit]);
    expect(await raiseMisdirectedPaymentAlerts(c as never, base)).toEqual({ raised: 1, forward_by: "2026-10-19" });
    const ins = c.calls.find(([s]) => /INSERT INTO accounting\.factoring_misdirected_payment_alerts/.test(s))!;
    expect(ins[1]).toEqual(["co", "bt-1", "payment", "pay-1", "inv-1", "fp-1", "pl-1", "v-faro", "cus-1", "2026-10-16", "2026-10-19", "150000", "u-1"]);
    expect(c.calls.map(([s]) => s).join("\n")).not.toMatch(/journal_entries|posting_lines|INSERT INTO accounting\.(?!factoring_misdirected)/);
  });

  it("no purchased invoice → no alert", async () => {
    const c = client({ is_credit: true }, []);
    expect((await raiseMisdirectedPaymentAlerts(c as never, base)).raised).toBe(0);
  });

  it("money out, or a bill / expense match, never raises", async () => {
    expect((await raiseMisdirectedPaymentAlerts(client({ is_credit: false }, [hit]) as never, base)).raised).toBe(0);
    const c = client({ is_credit: true }, [hit]);
    expect((await raiseMisdirectedPaymentAlerts(c as never, { ...base, ledger_entry_kind: "bill" })).raised).toBe(0);
    expect(c.query).not.toHaveBeenCalled();
  });
});
