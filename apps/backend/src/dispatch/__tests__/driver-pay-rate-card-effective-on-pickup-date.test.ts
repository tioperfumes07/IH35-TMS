import { describe, expect, it, vi } from "vitest";
import { createDriverBillArtifacts, type BookLoadInput, type BookLoadStop } from "../book-load.service.js";

// ROUND 443.31 (Lead, 2026-10-10): the driver pay card that prices a load is the one EFFECTIVE ON THE LOAD'S PICKUP DATE,
// never the newest card. Measured: Angel 52037e93's only card (48c) starts 2026-08-07 and priced load 13498 (picked up
// 2026-08-03) at 606.67. No card on the pickup date -> refused by name (skipped_no_pay_rate with the reason).
// The fake client applies the card predicate to a list of cards exactly as the SQL encodes it (effective_from <= d,
// effective_to NULL or >= d (inclusive), is_active OR closed), and the test also asserts the SQL carries it.

const audit = vi.hoisted(() => ({ calls: [] as Array<{ eventClass: string; payload: Record<string, unknown> }> }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async (_c: unknown, _u: string, eventClass: string, payload: Record<string, unknown>) => {
    audit.calls.push({ eventClass, payload });
  }),
}));

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "52037e93-484a-4659-ab60-cf2a78f4c647";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
type Card = { effective_from: string; effective_to: string | null; is_active: boolean; rate_per_mile_cents: string };

function input(): BookLoadInput {
  return {
    requestingUserUuid: "33333333-3333-4333-8333-333333333333",
    requestingUserRole: "Dispatcher",
    operating_company_id: OPCO,
    customer_id: "44444444-4444-4444-8444-444444444444",
    status: "booked",
    charges: [],
    stops: [],
    save_mode: "book_dispatch",
    assigned_primary_driver_id: DRIVER,
  } as BookLoadInput;
}

function fakeClient(pickupDate: string | null, cards: Card[]) {
  const inserted: unknown[][] = [];
  const rateSql: string[] = [];
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id::text/.test(sql) && /FROM driver_finance\.driver_bills/.test(sql)) return { rows: [] };
    if (/FROM mdata\.load_stops/.test(sql)) return { rows: pickupDate ? [{ d: pickupDate }] : [] };
    if (/FROM driver_finance\.driver_pay_rates/.test(sql)) {
      rateSql.push(sql);
      const d = values[2] as string | null;
      const hit = d
        ? cards
            .filter((c) => (c.is_active || c.effective_to !== null) && c.effective_from <= d && (c.effective_to === null || c.effective_to >= d))
            .sort((a, b) => b.effective_from.localeCompare(a.effective_from))[0]
        : undefined;
      return {
        rows: hit
          ? [{ basis_type: "per_mile_pay", rate_per_mile_cents: hit.rate_per_mile_cents, flat_per_load_cents: null, miles_basis: "practical_miles", is_test_data: false, rate_empty_per_mile_cents: null }]
          : [],
      };
    }
    if (/INSERT INTO driver_finance\.driver_bills/.test(sql)) {
      inserted.push(values);
      return { rows: [{ id: `bill-${inserted.length}` }] };
    }
    if (/audit\.audit_events/.test(sql)) return { rows: [{ exists: false }] };
    // 443.110 G9 — the mint stamps the bill's truck / trailer from the load (restampDriverBillUnitAndTrailer); no-op here.
    if (/UPDATE driver_finance\.driver_bills b\s+SET unit_id/.test(sql)) return { rows: [], rowCount: 0 } as never;
    // LEAD 443.233 owner miles rule (short-miles-fallback.ts): no practical, no lane, no history, no geocoded stops here.
    if (/miles_practical::text AS p|AS o,|l\.miles_shortest::text AS m|latitude::text AS lat/.test(sql)) return { rows: [] };
    throw new Error(`fakeClient: unhandled query: ${sql}`);
  });
  return { query, inserted, rateSql };
}

// LEAD 443.192 (12:35Z) OWNER LAW: per-mile pay is SHORT miles only — the fixture carries short miles (practical differs and is ignored).
const load = { id: LOAD_ID, load_number: "13498", miles_practical: 1363.9, miles_shortest: 1263.9 };
const stops = [{ stop_type: "pickup", sequence_number: 1 }, { stop_type: "delivery", sequence_number: 2 }] as BookLoadStop[];
const RATE_COL = 9;

describe("driver pay card = the card effective on the pickup date (ROUND 443.31)", () => {
  it("Angel's shape: only card starts 08-07, load picked up 08-03 -> NOT priced with the newest card; refused by name", async () => {
    audit.calls.length = 0;
    const c = fakeClient("2026-08-03", [{ effective_from: "2026-08-07", effective_to: null, is_active: true, rate_per_mile_cents: "48" }]);
    await createDriverBillArtifacts(c, input(), load, "13498", stops);
    const skip = audit.calls.find((a) => a.eventClass === "driver_finance.driver_bill.skipped_no_pay_rate");
    expect(skip?.payload.reason).toBe("no_rate_card_effective_on_pickup_date");
    expect(skip?.payload.rate_card_refusal).toEqual({ reason: "no_rate_card_effective_on_pickup_date", pickup_date: "2026-08-03" });
    for (const v of c.inserted) expect(v[RATE_COL]).not.toBe(48);
  });

  it("two cards: a pickup inside the OLD card's range is priced at the old rate, not the newest", async () => {
    const cards: Card[] = [
      { effective_from: "2026-08-07", effective_to: "2026-08-30", is_active: false, rate_per_mile_cents: "45" },
      { effective_from: "2026-08-31", effective_to: null, is_active: true, rate_per_mile_cents: "48" },
    ];
    const c = fakeClient("2026-08-20", cards);
    await createDriverBillArtifacts(c, input(), load, "13498", stops);
    expect(c.inserted[0]?.[RATE_COL]).toBe(45);
  });

  it("effective_to is inclusive: pickup ON the old card's last day uses the old card; the next day uses the new one", async () => {
    const cards: Card[] = [
      { effective_from: "2026-08-07", effective_to: "2026-08-30", is_active: false, rate_per_mile_cents: "45" },
      { effective_from: "2026-08-31", effective_to: null, is_active: true, rate_per_mile_cents: "48" },
    ];
    const onLastDay = fakeClient("2026-08-30", cards);
    await createDriverBillArtifacts(onLastDay, input(), load, "13498", stops);
    expect(onLastDay.inserted[0]?.[RATE_COL]).toBe(45);
    const nextDay = fakeClient("2026-08-31", cards);
    await createDriverBillArtifacts(nextDay, input(), load, "13498", stops);
    expect(nextDay.inserted[0]?.[RATE_COL]).toBe(48);
  });

  it("no pickup date -> refused by name (no_pickup_date), never the newest card", async () => {
    audit.calls.length = 0;
    const c = fakeClient(null, [{ effective_from: "2026-08-07", effective_to: null, is_active: true, rate_per_mile_cents: "48" }]);
    await createDriverBillArtifacts(c, input(), load, "13498", stops);
    expect(audit.calls.find((a) => a.eventClass === "driver_finance.driver_bill.skipped_no_pay_rate")?.payload.reason).toBe("no_pickup_date");
  });

  it("the card SQL selects by the pickup date (inclusive range), not by 'effective_to IS NULL ORDER BY newest'", async () => {
    const c = fakeClient("2026-08-20", [{ effective_from: "2026-08-07", effective_to: null, is_active: true, rate_per_mile_cents: "48" }]);
    await createDriverBillArtifacts(c, input(), load, "13498", stops);
    const sql = c.rateSql[0]!.replace(/\s+/g, " ");
    expect(sql).toContain("effective_from <= $3::date");
    expect(sql).toContain("(effective_to IS NULL OR effective_to >= $3::date)");
    expect(sql).not.toMatch(/AND is_active AND effective_to IS NULL/);
  });
  // LEAD 443.192 (12:35Z) OWNER LAW: "Per-mile drivers are ALWAYS paid SHORT miles — never practical miles." Before: a load with
  // practical miles and no short miles was priced at practical (13656: 1897.7 x 45c = $853.97). Fails on the old engine.
  it("443.192 / 443.220: practical miles only (no short miles) is never priced — the bill waits for short miles, never practical x rate", async () => {
    audit.calls.length = 0;
    const practicalOnly = { ...load, miles_practical: 1897.7, miles_shortest: null };
    const c = fakeClient("2026-08-20", [{ effective_from: "2026-08-07", effective_to: null, is_active: true, rate_per_mile_cents: "45" }]);
    await createDriverBillArtifacts(c, input(), practicalOnly, "13498", stops);
    for (const v of c.inserted) expect(v.includes(85397)).toBe(false);
    expect(audit.calls.some((a) => a.eventClass === "driver_finance.driver_bill.awaiting_short_miles")).toBe(true);
  });
});
