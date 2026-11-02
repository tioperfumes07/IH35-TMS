/**
 * LEAD 443.196 — the Dreamline statement matcher pairs every line with its OWN truck's receipt before any line may fall
 * back to another truck's receipt, across the whole statement (not file order).
 * Fail-old: the 08-20 statement in file order — T163's EFS 09992 is the first line of the day and T163's receipt is not
 * on the books. On main the inline any-truck fallback let 09992 take T164's diesel and T175's DEF; T175's EFS 11946 DEF
 * then took T164's 08-21 DEF, and T164's own lines found their receipts gone. Here every truck's own line adopts its own
 * receipt and T163's lines adopt nothing (they go to the no-receipt import path).
 */
import { describe, expect, it, vi } from "vitest";
// OWNER RULING 443.288-A: the child document is linked to its receipt through THE family link (asserted below).
const family = vi.hoisted(() => ({ linkExpenseChildToParentInClientTx: vi.fn(async () => undefined) }));
vi.mock("../../accounting/reclassify/reclassify.service.js", async (importOriginal) => ({ ...(await importOriginal<object>()), ...family }));

vi.mock("../../lib/feature-flags/service.js", () => ({ isEnabled: vi.fn(async () => true) }));
vi.mock("../../accounting/coa-roles/resolver.service.js", () => ({
  resolveRoleAccountOptional: vi.fn(async (_c: unknown, _co: string, role: string) => (role === "fuel_card_payable_dreamline" ? "acct-2510" : null)),
}));
vi.mock("../../accounting/posting-engine.service.js", () => ({ ensureOpenPeriod: vi.fn(async () => undefined) }));
vi.mock("../../accounting/journal-entry-type-resolver.js", () => ({ hasJournalEntryTypeColumn: vi.fn(async () => false), resolveJournalEntryTypeId: vi.fn() }));
vi.mock("../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../accounting/bank-recon/match.service.js", () => ({ FUEL_CARD_DISCOUNT_ITEM: "Fuel Card Discount" }));
vi.mock("../../accounting/bank-recon/bank-match-fuel-post.service.js", () => ({ postFuelFillOnReceipt: vi.fn() }));
vi.mock("../../accounting/fuel-posting/maybe-post-from-fuel-transaction.service.js", () => ({ FUEL_POSTS_ON_RECEIPT_FLAG_KEY: "FUEL_POSTS_ON_RECEIPT_ENABLED" }));
vi.mock("../../accounting/expense-gl-posting-flag.js", () => ({ EXPENSE_GL_POSTING_FLAG_KEY: "EXPENSE_GL_POSTING_ENABLED" }));
vi.mock("../../accounting/expense-writer.service.js", () => ({ createExpenseInClientTx: vi.fn(async () => ({ expense_id: "e-diff", posted_journal_entry_id: "je-diff" })), postExpenseDocumentInClientTx: vi.fn() }));
vi.mock("../fuel-load-at-time.js", () => ({ resolveFuelLoadAtTime: vi.fn(async () => null), resolveFillDriverAtTime: vi.fn(async () => null) }));
vi.mock("../fuel-provider-reference.js", () => ({ findLiveFuelByProviderTransactionId: vi.fn(async () => null) }));

import { importDreamlineStatement, type DreamlineStatementLine } from "../dreamline-statement-import.service.js";

const L = (efs: string, item: string, at: string, local: string, unit: string, gross: number, net: number, n: number): DreamlineStatementLine => ({
  line_number: n, card_number: `card-${unit}`, transaction_at: at, local_date: local, efs_invoice: efs, unit_label: unit, driver_name: null,
  location_name: "LOVES #1 TRAVEL STOP", city: null, state: null, item, product: item === "DEFD" ? "def" : "diesel",
  quantity: null, retail_ppu: null, gross_cents: gross, discount_cents: gross - net, net_cents: net, fee_cents: 0,
});
// The 08-19..21 statement lines of T163 / T164 / T175 (amounts in cents, as the parser rounds them), in FILE order.
const LINES: DreamlineStatementLine[] = [
  L("05750", "ULSD", "2026-08-19T06:28:00.000Z", "2026-08-19", "175", 84376, 80378, 1),
  L("09992", "ULSD", "2026-08-20T05:54:00.000Z", "2026-08-20", "163", 64665, 60511, 2),
  L("09992", "DEFD", "2026-08-20T05:54:00.000Z", "2026-08-20", "163", 2371, 2371, 3),
  L("0894204440", "ULSD", "2026-08-20T06:38:00.000Z", "2026-08-20", "164", 64478, 62023, 4),
  L("0894204440", "DEFD", "2026-08-20T06:38:00.000Z", "2026-08-20", "164", 2494, 2494, 5),
  L("11946", "ULSD", "2026-08-21T01:11:00.000Z", "2026-08-20", "175", 72680, 67257, 6),
  L("11946", "DEFD", "2026-08-21T01:11:00.000Z", "2026-08-20", "175", 2459, 2459, 7),
  L("72968", "ULSD", "2026-08-21T20:07:00.000Z", "2026-08-21", "164", 60920, 60920, 8),
  L("72968", "DEFD", "2026-08-21T20:07:00.000Z", "2026-08-21", "164", 2484, 2484, 9),
];
// The receipts the Settlement Creator booked (paid from 2510), none adopted yet.
const BOOKED = [
  ["b700c751", "2026-08-20", "T164", "diesel", 64476],
  ["62f3cad0", "2026-08-20", "T164", "def", 2492],
  ["787e6d50", "2026-08-21", "T164", "diesel", 60920],
  ["5ea5f41a", "2026-08-21", "T164", "def", 2482],
  ["14996d48", "2026-08-20", "T175", "diesel", 72680],
  ["71d18efd", "2026-08-20", "T175", "def", 2459],
].map(([id, d, unit, ft, c]) => ({
  expense_id: `exp-${id}`, expense_number: null, d, unit_number: unit, fuel_type: ft, accts: [ft === "def" ? "5010" : "5000"],
  cents: String(c), rail: "card", fuel_transaction_id: `ft-${id}`, notes: null,
}));

function fakeClient() {
  const stamps: Array<{ ft: string; marker: string }> = [];
  const query = vi.fn(async (sql: string, params: unknown[] = []) => {
    if (sql.includes("catalogs.fuel_card_types")) return { rows: [{ id: "card-type" }] };
    if (sql.includes("FROM catalogs.accounts WHERE operating_company_id")) return { rows: [{ id: "acct-2510" }] };
    if (sql.includes("FROM catalogs.items")) return { rows: [{ id: "item-1", account_id: "acct-5000" }] };
    if (sql.includes("e.source_fuel_transaction_id::text AS fuel_transaction_id")) return { rows: BOOKED };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-diff" }] };
    if (sql.includes("FROM accounting.expenses WHERE id = $1::uuid")) return { rows: [{ vendor: "v", load_id: "l", driver: null, unit_id: null, trailer_id: null }] };
    if (sql.includes("UPDATE fuel.fuel_transactions") && sql.includes("concat_ws")) {
      stamps.push({ ft: String(params[0]), marker: String(params[2]) });
      return { rows: [], rowCount: 1 };
    }
    return { rows: [] };
  });
  return { client: { query }, stamps };
}

const EXPECTED: Record<string, string | null> = {
  "05750:ULSD": null, // T175's 08-19 fill: its own receipt is not booked; 14996d48 is 11946's
  "09992:ULSD": null, // T163: no receipt on the books -> never another truck's
  "09992:DEFD": null,
  "0894204440:ULSD": "exp-b700c751",
  "0894204440:DEFD": "exp-62f3cad0",
  "11946:ULSD": "exp-14996d48",
  "11946:DEFD": "exp-71d18efd",
  "72968:ULSD": "exp-787e6d50",
  "72968:DEFD": "exp-5ea5f41a",
};

describe("Dreamline statement matcher — same truck first across the whole statement (443.196)", () => {
  for (const dry of [true, false]) {
    it(`the 08-20 file order (T163 09992 first) pairs every line with its own truck's receipt (dry_run=${dry})`, async () => {
      const { client, stamps } = fakeClient();
      const s = await importDreamlineStatement(client as never, { operating_company_id: "co", actor_user_uuid: "u", lines: LINES, dry_run: dry });
      const got = Object.fromEntries(s.results.map((r) => [`${r.efs_invoice}:${r.item}`, r.outcome === "adopted" ? r.expense_id ?? null : null]));
      expect(got).toEqual(EXPECTED);
      if (!dry) {
        expect(stamps.sort((a, b) => a.ft.localeCompare(b.ft))).toEqual([
          { ft: "ft-14996d48", marker: "dreamline_efs=11946:ULSD:1" },
          { ft: "ft-5ea5f41a", marker: "dreamline_efs=72968:DEFD:1" },
          { ft: "ft-62f3cad0", marker: "dreamline_efs=0894204440:DEFD:1" },
          { ft: "ft-71d18efd", marker: "dreamline_efs=11946:DEFD:1" },
          { ft: "ft-787e6d50", marker: "dreamline_efs=72968:ULSD:1" },
          { ft: "ft-b700c751", marker: "dreamline_efs=0894204440:ULSD:1" },
        ]);
      }
    });
  }
});
