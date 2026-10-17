import { describe, expect, it, vi } from "vitest";

/**
 * LEAD 443.192 — Event 1 (earn) is dated by its delivery evidence, never by the fire time.
 *
 * Before: postLoadRevenueLatch read the final delivery stop's actual_departure_at as the earn GATE and then
 * dated the JE with the caller's entry_date_iso (companyBusinessDate() at fire time on every delivery path).
 * Prod shape: load 13541 delivered 2026-08-28, latched 2026-10-16 -> earn dated 10-16 (verify-pl-cost-of-revenue
 * red). This test FAILS on the old poster (entry_date = the caller's "2026-10-16").
 *
 * Pure unit test — DB, role resolver and JE writer mocked (same pattern as poster-pod-evidence-gate.test.ts).
 * The Chicago-date conversion and closed-period cutoff are SQL; the mock answers them the way Postgres would.
 */

const { mockQuery, mockWithLuciaBypass, mockIsEnabled, mockCreateJournalEntry, mockResolveRoleAccount } = vi.hoisted(() => {
  const query = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query })),
    mockIsEnabled: vi.fn(),
    mockCreateJournalEntry: vi.fn(),
    mockResolveRoleAccount: vi.fn(),
  };
});

vi.mock("../../../auth/db.js", () => ({ withLuciaBypass: mockWithLuciaBypass }));
vi.mock("../../../lib/feature-flags/service.js", () => ({ isEnabled: mockIsEnabled }));
vi.mock("../../journal-entries.service.js", () => ({ createJournalEntry: mockCreateJournalEntry }));
vi.mock("../../coa-roles/resolver.service.js", () => ({ resolveRoleAccount: mockResolveRoleAccount }));
vi.mock("../../../audit/crud-audit.js", () => ({ appendCrudAudit: vi.fn(async () => undefined) }));
vi.mock("../../accounting-spine-emit.js", () => ({ writeTransactionSourceLink: vi.fn(async () => undefined) }));

const { postLoadRevenueLatch } = await import("../poster.service.js");

const OPCO = "11111111-1111-4111-8111-111111111111";
const LOAD_ID = "44444444-4444-4444-8444-444444444444";
const ACTOR = "22222222-2222-4222-8222-222222222222";
const FIRE_DAY = "2026-10-16";

type Opts = {
  departureAt: string | null;
  departureChicagoDate?: string;
  manualAuthAt?: string | null;
  manualAuthChicagoDate?: string;
  closedThrough?: string | null;
};

function install({ departureAt, departureChicagoDate, manualAuthAt = null, manualAuthChicagoDate, closedThrough = null }: Opts) {
  mockQuery.mockReset();
  mockQuery.mockImplementation(async (sql: string, values?: unknown[]) => {
    if (sql.includes("closed_period_cutoff")) {
      const ts = values?.[0];
      const evidence_date = ts === departureAt ? departureChicagoDate : ts === manualAuthAt ? manualAuthChicagoDate : null;
      expect(values?.[2]).toBe("America/Chicago");
      return { rows: [{ evidence_date, closed_through: closedThrough }] };
    }
    if (sql.includes("set_config")) return { rows: [] };
    if (sql.includes("to_regclass")) return { rows: [{ ok: true }] };
    if (sql.includes("FROM org.companies")) return { rows: [{ code: "USMCA" }] };
    if (sql.includes("FROM mdata.load_stops")) return { rows: departureAt ? [{ actual_departure_at: departureAt }] : [] };
    if (sql.includes("FROM dispatch.manual_delivery_authorizations")) {
      return { rows: manualAuthAt ? [{ authorized_at: manualAuthAt }] : [] };
    }
    if (sql.includes("FROM mdata.loads")) {
      return { rows: [{ id: LOAD_ID, status: "delivered_pending_docs", rate_total_cents: "250000", display_id: "13541", is_sample_data: false }] };
    }
    return { rows: [] };
  });
  mockIsEnabled.mockReset().mockResolvedValue(true);
  mockResolveRoleAccount.mockReset().mockImplementation(async (_c: unknown, _o: string, role: string) => `acct-${role}`);
  mockCreateJournalEntry.mockReset().mockResolvedValue({ id: "je-1" });
}

function fire(targetStatus = "delivered_pending_docs") {
  return postLoadRevenueLatch({
    operating_company_id: OPCO,
    load_id: LOAD_ID,
    target_status: targetStatus,
    entry_date_iso: FIRE_DAY,
    actor_user_id: ACTOR,
  });
}

function postedEntryDate(): string {
  expect(mockCreateJournalEntry).toHaveBeenCalledTimes(1);
  return (mockCreateJournalEntry.mock.calls[0]![0] as { entry_date: string }).entry_date;
}

describe("LEAD 443.192 — revrec Event 1 is dated by its delivery evidence", () => {
  it("dates the earn on the final delivery stop's departure day, not the day the latch fired", async () => {
    install({ departureAt: "2026-08-28 20:15:00+00", departureChicagoDate: "2026-08-28" });
    const r = await fire();
    expect(r.posted).toBe(true);
    expect(postedEntryDate()).toBe("2026-08-28");
  });

  it("uses the company (Chicago) day — a 03:30Z departure belongs to the previous Central day", async () => {
    install({ departureAt: "2026-08-28 03:30:00+00", departureChicagoDate: "2026-08-27" });
    await fire();
    expect(postedEntryDate()).toBe("2026-08-27");
  });

  it("dates a manually-authorized earn on the authorization's own timestamp", async () => {
    install({ departureAt: null, manualAuthAt: "2026-09-02 15:00:00+00", manualAuthChicagoDate: "2026-09-02" });
    await fire();
    expect(postedEntryDate()).toBe("2026-09-02");
  });

  it("falls back to the caller's date when the evidence day is in a closed period", async () => {
    install({ departureAt: "2026-08-28 20:15:00+00", departureChicagoDate: "2026-08-28", closedThrough: "2026-08-31" });
    await fire();
    expect(postedEntryDate()).toBe(FIRE_DAY);
  });

  it("still refuses with no evidence at all (gate unchanged)", async () => {
    install({ departureAt: null });
    const r = await fire();
    expect(r).toEqual({ posted: false, reason: "missing_delivery_evidence" });
    expect(mockCreateJournalEntry).not.toHaveBeenCalled();
  });
});
