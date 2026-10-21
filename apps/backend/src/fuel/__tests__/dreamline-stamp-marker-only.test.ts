/**
 * LEAD 443.197 — the Dreamline adoption stamp (and its inverse) writes the MARKER ONLY.
 * Fail-old: on main (bd41d055ba #26780) stampDreamlineReceiptAdopted also set the adopted receipt's gross_cost /
 * discount_amount to the CARD's figures, so the Settlement Creator receipt read total_cost <> gross_cost − discount
 * (305 rows in verify-control-totals' fuel-discount check) while the card difference ALSO posted (Dr 2510 / Cr 5000).
 * The unstamp then nulled gross / zeroed discount — again writing amounts that were never the line's.
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
  importDreamlineStatement,
  stampDreamlineReceiptAdopted,
  unstampDreamlineReceiptAdopted,
  type DreamlineStatementLine,
} from "../dreamline-statement-import.service.js";

const AMOUNT_COLUMNS = /gross_cost|discount_amount|total_cost/;

function fakeClient() {
  const fuelUpdates: Array<{ sql: string; params: unknown[] }> = [];
  const postings: unknown[] = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("catalogs.fuel_card_types")) return { rows: [{ id: "card-type" }] };
    if (sql.includes("FROM catalogs.accounts WHERE operating_company_id")) return { rows: [{ id: "acct-2510" }] };
    if (sql.includes("FROM catalogs.items")) return { rows: [{ id: "item-1", account_id: "acct-5000" }] };
    if (sql.includes("e.source_fuel_transaction_id::text AS fuel_transaction_id")) {
      return { rows: [{ expense_id: "exp-R", expense_number: "13600-1", d: "2026-08-26", unit_number: "T173", fuel_type: "diesel",
        accts: ["5000"], cents: "55987", rail: "card", fuel_transaction_id: "ft-R", notes: null }] };
    }
    if (sql.includes("INSERT INTO accounting.journal_entries")) { postings.push(params); return { rows: [{ id: "je-diff" }] }; }
    if (sql.startsWith("SELECT notes")) return { rows: [{ notes: "dreamline_efs=42359:ULSD:1" }] };
    if (sql.includes("UPDATE fuel.fuel_transactions")) { fuelUpdates.push({ sql, params }); return { rows: [], rowCount: 1 }; }
    return { rows: [] };
  });
  return { client: { query }, fuelUpdates, postings };
}

const line: DreamlineStatementLine = {
  line_number: 2, card_number: "708305003079747097", transaction_at: "2026-08-27T00:07:00.000Z", local_date: "2026-08-26",
  efs_invoice: "42359", unit_label: "173", driver_name: null, location_name: "LOVES #1", city: "BEAUMONT", state: "TX",
  item: "ULSD", product: "diesel", quantity: 102, retail_ppu: null, gross_cents: 55988, discount_cents: 4580, net_cents: 51408, fee_cents: 0,
};

describe("Dreamline adoption stamp writes the marker only (443.197)", () => {
  it("the import adopts the receipt: marker stamped, receipt amounts untouched, card difference still posts", async () => {
    const { client, fuelUpdates, postings } = fakeClient();
    const s = await importDreamlineStatement(client as never, { operating_company_id: "co", actor_user_uuid: "u", lines: [line] });
    expect(s.results[0]!.outcome).toBe("adopted");
    expect(s.results[0]!.difference_cents).toBe(55987 - 51408);
    expect(postings).toHaveLength(1); // Dr 2510 / Cr Fuel Card Discount stays as posted
    expect(fuelUpdates).toHaveLength(1);
    expect(fuelUpdates[0]!.sql).not.toMatch(AMOUNT_COLUMNS); // FAIL-OLD: main set gross_cost / discount_amount here
    expect(fuelUpdates[0]!.params).toEqual(["ft-R", "co", "dreamline_efs=42359:ULSD:1"]);
  });

  it("stamp: one UPDATE of notes, no amount column", async () => {
    const { client, fuelUpdates } = fakeClient();
    await stampDreamlineReceiptAdopted(client as never, { companyId: "co", fuelTransactionId: "ft-R", marker: "dreamline_efs=1:ULSD:1" });
    expect(fuelUpdates).toHaveLength(1);
    expect(fuelUpdates[0]!.sql).not.toMatch(AMOUNT_COLUMNS);
  });

  it("unstamp: removes the marker, no amount column (main nulled gross / zeroed discount)", async () => {
    const { client, fuelUpdates } = fakeClient();
    expect(await unstampDreamlineReceiptAdopted(client as never, { companyId: "co", fuelTransactionId: "ft-R", marker: "dreamline_efs=42359:ULSD:1" })).toBe(1);
    expect(fuelUpdates).toHaveLength(1);
    expect(fuelUpdates[0]!.sql).not.toMatch(AMOUNT_COLUMNS); // FAIL-OLD
    expect(fuelUpdates[0]!.params[2]).toBe("");
  });
});
