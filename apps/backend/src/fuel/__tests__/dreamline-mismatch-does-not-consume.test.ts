/**
 * LEAD 443.195 — the Dreamline statement matcher consumes a booked receipt ONLY when the line adopts (stamps) it.
 * Fail-old: on main an amount-mismatch line added the receipt to `used` without stamping it, so the receipt's true
 * statement line — later in the file — found it taken and imported the same purchase again (load 13555 diesel EFS 72968;
 * T175 08-20 diesel EFS 11946). Here line A (an earlier, bigger fill of the same truck) mismatches receipt R; line B is
 * R's own line (card gross == receipt): B must ADOPT R (marker stamped on R) — on main B fell through to the import path.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => true) }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: vi.fn(async (_c: unknown, _co: string, role: string) => (role === "fuel_card_payable_dreamline" ? "acct-2510" : null)),
}));
vi.mock("../../accounting/posting-line-writer.js", () => ({ insertPostingLineWithSpine: vi.fn(async () => undefined) }));
vi.mock("../../accounting/posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting/journal-entry-type-resolver.js", () => ({ hasJournalEntryTypeColumn: vi.fn(async () => false), resolveJournalEntryTypeId: vi.fn() }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../accounting/bank-recon/match.service.js", () => ({ FUEL_CARD_DISCOUNT_ITEM: "Fuel Card Discount" }));
vi.mock("../../accounting/bank-recon/bank-match-fuel-post.service.js", () => ({ postFuelFillOnReceipt: vi.fn() }));
vi.mock("../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js", () => ({ FUEL_POSTS_ON_RECEIPT_FLAG_KEY: "FUEL_POSTS_ON_RECEIPT_ENABLED" }));
vi.mock("../../accounting/expense-gl-posting-flag.js", () => ({ EXPENSE_GL_POSTING_FLAG_KEY: "EXPENSE_GL_POSTING_ENABLED" }));
vi.mock("../../accounting/expense-writer.service.js", () => ({ createExpenseInClientTx: vi.fn(), postExpenseDocumentInClientTx: vi.fn() }));
vi.mock("../fuel-load-at-time.js", () => ({ resolveFuelLoadAtTime: vi.fn(async () => null), resolveFillDriverAtTime: vi.fn(async () => null) }));
vi.mock("../fuel-provider-reference.js", () => ({ findLiveFuelByProviderTransactionId: vi.fn(async () => null) }));

import {
  dreamlineAdoptionRefused,
  importDreamlineStatement,
  unstampDreamlineReceiptAdopted,
  type DreamlineStatementLine,
} from "../dreamline-statement-import.service.js";

const line = (n: number, at: string, local: string, gross: number, net: number, unit = "164"): DreamlineStatementLine => ({
  line_number: n, card_number: "7083050030797447047", transaction_at: at, local_date: local, efs_invoice: `INV${n}`,
  unit_label: unit, driver_name: null, location_name: "LOVES #1 TRAVEL STOP", city: "LAREDO", state: "TX",
  item: "ULSD", product: "diesel", quantity: 100, retail_ppu: null, gross_cents: gross, discount_cents: gross - net, net_cents: net, fee_cents: 0,
});

function fakeClient() {
  const stamps: Array<{ ft: string; marker: string }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("catalogs.fuel_card_types")) return { rows: [{ id: "card-type" }] };
    if (sql.includes("FROM catalogs.accounts WHERE operating_company_id")) return { rows: [{ id: "acct-2510" }] };
    if (sql.includes("FROM catalogs.items")) return { rows: [{ id: "item-1", account_id: "acct-5000" }] };
    if (sql.includes("e.source_fuel_transaction_id::text AS fuel_transaction_id")) {
      return { rows: [{ expense_id: "exp-R", expense_number: "13555-1", d: "2026-08-20", unit_number: "T164", fuel_type: "diesel",
        accts: ["5000"], cents: "72680", rail: "2510", fuel_transaction_id: "ft-R", notes: null }] };
    }
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-diff" }] };
    if (sql.includes("UPDATE fuel.fuel_transactions") && sql.includes("concat_ws")) {
      stamps.push({ ft: String(params[0]), marker: String(params[2]) });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
  return { client: { query }, stamps };
}

describe("Dreamline statement matcher — a receipt is consumed only when adopted (443.195)", () => {
  it("an amount-mismatch line does not consume the receipt: its own later line adopts it (stamped)", async () => {
    const { client, stamps } = fakeClient();
    // A: 08-19 fill, card net 803.78 — matches R by truck+day±1 (within 15%) but the card charged more than R -> mismatch.
    const a = line(2, "2026-08-19T06:28:00.000Z", "2026-08-19", 84376, 80378);
    // B: R's own line — card gross 726.80 == receipt — on a card whose unit label is stale (the any-truck fallback, so
    // the 443.196 same-truck plan does not reserve R for it: A meets R first in the walk).
    const b = line(3, "2026-08-21T01:11:00.000Z", "2026-08-20", 72680, 67257, "999");
    const s = await importDreamlineStatement(client as never, { operating_company_id: "co", actor_user_uuid: "u", lines: [a, b] });
    const byLine = Object.fromEntries(s.results.map((r) => [r.line_number, r]));
    expect(byLine[2]!.outcome).toBe("amount_mismatch");
    expect(byLine[3]!.outcome).toBe("adopted");
    expect(byLine[3]!.expense_id).toBe("exp-R");
    // the receipt carries exactly B's marker — never A's (A wrote nothing)
    expect(stamps).toEqual([{ ft: "ft-R", marker: "dreamline_efs=INV3:ULSD:1" }]);
  });

  it("dry run plans the same pairing", async () => {
    const { client, stamps } = fakeClient();
    const s = await importDreamlineStatement(client as never, {
      operating_company_id: "co", actor_user_uuid: "u", dry_run: true,
      lines: [line(2, "2026-08-19T06:28:00.000Z", "2026-08-19", 84376, 80378), line(3, "2026-08-21T01:11:00.000Z", "2026-08-20", 72680, 67257, "999")],
    });
    expect(s.results.map((r) => r.outcome)).toEqual(["amount_mismatch", "adopted"]);
    expect(stamps).toEqual([]);
  });

  it("dreamlineAdoptionRefused: card more than receipt beyond $1, or receipt > 5% from pump retail", () => {
    expect(dreamlineAdoptionRefused(72680, { gross_cents: 84376, net_cents: 80378 })).toBe(true);
    expect(dreamlineAdoptionRefused(72680, { gross_cents: 72680, net_cents: 67257 })).toBe(false);
    expect(dreamlineAdoptionRefused(2482, { gross_cents: 2484, net_cents: 2484 })).toBe(false);
  });

  it("unstamp removes exactly the named marker and keeps the rest of the notes", async () => {
    const updates: unknown[][] = [];
    const client = { query: vi.fn(async (sql: string, params: unknown[]) => {
      if (sql.startsWith("SELECT notes")) return { rows: [{ notes: "gallons estimated at average price (owner 10-10); dreamline_efs=11946:DEFD:1" }] };
      updates.push(params);
      return { rows: [], rowCount: 1 };
    }) };
    expect(await unstampDreamlineReceiptAdopted(client as never, { companyId: "co", fuelTransactionId: "ft", marker: "dreamline_efs=11946:DEFD:1" })).toBe(1);
    expect(updates[0]![2]).toBe("gallons estimated at average price (owner 10-10)");
    expect(updates[0]).toHaveLength(3); // LEAD 443.197 — notes only: the receipt's amounts are never touched
    expect(await unstampDreamlineReceiptAdopted(client as never, { companyId: "co", fuelTransactionId: "ft", marker: "dreamline_efs=1194:DEFD:1" })).toBe(0);
  });
});
