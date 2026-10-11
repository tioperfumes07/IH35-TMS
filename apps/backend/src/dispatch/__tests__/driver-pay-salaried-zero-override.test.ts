import { describe, expect, it, vi } from "vitest";
import { createDriverBillArtifacts, isSalariedZeroRateOverride, type BookLoadInput, type BookLoadStop } from "../book-load.service.js";
import { SALARIED_OVERRIDE_REASON } from "../../driver-finance/settlement-creator-seed-loads.js";

// Lead 443.36 #2 (Rafael 5780 / 5816; owner ruling: a LOCAL driver on WEEKLY SALARY has NO per-load driver bill): a signed
// rate of 0 counts only as a GO-21-B5 override whose reason starts "Salaried" (>= 10 chars). Then no driver bill is minted,
// no card prices the load, and the decision is audited. A 0 without that reason is ignored exactly as before (card prices).

const audit = vi.hoisted(() => ({ calls: [] as Array<{ eventClass: string; payload: Record<string, unknown> }> }));
vi.mock("../../audit/crud-audit.js", () => ({
  appendCrudAudit: vi.fn(async (_c: unknown, _u: string, eventClass: string, payload: Record<string, unknown>) => {
    audit.calls.push({ eventClass, payload });
  }),
}));

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const DRIVER = "8b2c1f1e-1111-4111-8111-111111111111";
const LOAD_ID = "22222222-2222-4222-8222-222222222222";
const RATE_COL = 9;
const SALARIED = "Salaried (owner ruling): weekly salary, no per-load pay";

function input(): BookLoadInput {
  return {
    requestingUserUuid: "33333333-3333-4333-8333-333333333333",
    requestingUserRole: "Owner",
    operating_company_id: OPCO,
    customer_id: "44444444-4444-4444-8444-444444444444",
    status: "booked",
    charges: [],
    stops: [],
    save_mode: "book_dispatch",
    assigned_primary_driver_id: DRIVER,
  } as BookLoadInput;
}

function fakeClient() {
  const inserted: unknown[][] = [];
  let rateCardReads = 0;
  const query = vi.fn(async (sql: string, values: unknown[] = []) => {
    if (/to_regclass/.test(sql)) return { rows: [{ exists: true }] };
    if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
    if (/SELECT id::text/.test(sql) && /FROM driver_finance\.driver_bills/.test(sql)) return { rows: [] };
    if (/FROM mdata\.load_stops/.test(sql)) return { rows: [{ d: "2026-08-20" }] };
    if (/FROM driver_finance\.driver_pay_rates/.test(sql)) {
      rateCardReads++;
      return { rows: [{ basis_type: "per_mile_pay", rate_per_mile_cents: "45", flat_per_load_cents: null, miles_basis: "practical_miles", is_test_data: false, rate_empty_per_mile_cents: null }] };
    }
    if (/INSERT INTO driver_finance\.driver_bills/.test(sql)) {
      inserted.push(values);
      return { rows: [{ id: `bill-${inserted.length}` }] };
    }
    if (/audit\.audit_events/.test(sql)) return { rows: [{ exists: false }] };
    throw new Error(`fakeClient: unhandled query: ${sql}`);
  });
  return { query, inserted, rateCardReads: () => rateCardReads };
}

const stops = [{ stop_type: "pickup", sequence_number: 1 }, { stop_type: "delivery", sequence_number: 2 }] as BookLoadStop[];
const baseLoad = { id: LOAD_ID, load_number: "13530", miles_practical: 600, miles_shortest: null, miles_deadhead: 40 };

describe("salaried week: rate 0 + reason 'Salaried…' (Lead 443.36 #2)", () => {
  it("mints NO driver bill, never reads the card, audits the override at 0 and the no-bill decision", async () => {
    audit.calls.length = 0;
    const c = fakeClient();
    const out = await createDriverBillArtifacts(c, input(), { ...baseLoad, driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED }, "13530", stops);
    expect(out).toEqual({ outcome: "not_minted_salaried", reason: SALARIED });
    expect(c.inserted).toHaveLength(0);
    expect(c.rateCardReads()).toBe(0);
    const ov = audit.calls.find((a) => a.eventClass === "driver_finance.driver_pay_rate.overridden");
    expect(ov?.payload).toMatchObject({ override_rate_per_mile_dollars: 0, override_cents: 0, override_reason: SALARIED, salaried: true });
    expect(audit.calls.some((a) => a.eventClass === "driver_finance.driver_bill.not_minted_salaried")).toBe(true);
  });

  it("rate 0 with NO reason is unchanged: ignored, the 45c card prices the bill", async () => {
    audit.calls.length = 0;
    const c = fakeClient();
    const out = await createDriverBillArtifacts(c, input(), { ...baseLoad, driver_pay_rate_per_mile: 0 }, "13530", stops);
    expect(out.outcome).toBe("minted");
    expect(c.inserted[0]?.[RATE_COL]).toBe(45);
  });

  it("rate 0 with a reason that is not 'Salaried…' is unchanged: ignored, the card prices the bill", async () => {
    const c = fakeClient();
    await createDriverBillArtifacts(c, input(), { ...baseLoad, driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: "Signed settlement rate" }, "13530", stops);
    expect(c.inserted[0]?.[RATE_COL]).toBe(45);
  });

  it("a positive override is unchanged: 0.50 with a reason prices at 50c, not the card", async () => {
    audit.calls.length = 0;
    const c = fakeClient();
    const out = await createDriverBillArtifacts(c, input(), { ...baseLoad, driver_pay_rate_per_mile: 0.5, driver_pay_rate_override_reason: "Signed settlement rate 0.50" }, "13530", stops);
    expect(out.outcome).toBe("minted");
    expect(c.inserted[0]?.[RATE_COL]).toBe(50);
    expect(audit.calls.some((a) => a.eventClass === "driver_finance.driver_bill.not_minted_salaried")).toBe(false);
  });

  it("predicate: only an explicit 0 with a 'Salaried' reason of >= 10 chars", () => {
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED })).toBe(true);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: "0", driver_pay_rate_override_reason: SALARIED })).toBe(true);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: null, driver_pay_rate_override_reason: SALARIED })).toBe(false);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_override_reason: SALARIED })).toBe(false);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: "Salaried" })).toBe(false);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0.45, driver_pay_rate_override_reason: SALARIED })).toBe(false);
  });

  it("Lead 443.53 #7: the 'Local driver — weekly salary' marker the Creator now writes is the same salaried override", () => {
    expect(SALARIED_OVERRIDE_REASON.startsWith("Local driver — weekly salary")).toBe(true);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: SALARIED_OVERRIDE_REASON })).toBe(true);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: "local driver — weekly salary, owner ruling" })).toBe(true);
    expect(isSalariedZeroRateOverride({ driver_pay_rate_per_mile: 0, driver_pay_rate_override_reason: "Local driver run, flat" })).toBe(false);
  });
});
