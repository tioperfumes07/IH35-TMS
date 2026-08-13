import { describe, expect, it, vi } from "vitest";
import { postFuelExpenseFromEvent } from "../poster.service.js";

// RANK2-FUEL-JE-CLASS — proves resolveFuelPostingClassId's real mechanism: unit.qbo_class_id /
// equipment.qbo_class_id -> catalogs.classes.qbo_class_id -> catalogs.classes.id, stamped onto BOTH
// journal_entry_postings lines. Mutation-provable: flip either mocked lookup to return no row and the
// class_id param on both posting lines reverts to null (asserted in the "unresolved" case below).

const { mockQuery, mockWithLuciaBypass, mockResolveAccountForCategory } = vi.hoisted(() => {
  const query = vi.fn();
  const withLuciaBypass = vi.fn(async (fn: (client: { query: typeof query }) => unknown) => fn({ query }));
  const resolveAccount = vi.fn();
  return {
    mockQuery: query,
    mockWithLuciaBypass: withLuciaBypass,
    mockResolveAccountForCategory: resolveAccount,
  };
});

vi.mock("../../../auth/db.js", async (orig) => {
  const actual = (await orig()) as Record<string, unknown>;
  return { ...actual, withLuciaBypass: mockWithLuciaBypass };
});

vi.mock("../../expense-category-map/resolver.service.js", () => ({
  resolveAccountForCategory: mockResolveAccountForCategory,
}));

const OPCO = "11111111-1111-4111-8111-111111111111";
const UNIT_ID = "33333333-3333-4333-8333-333333333333";
const TRAILER_ID = "44444444-4444-4444-8444-444444444444";
const RESOLVED_CLASS_ID = "55555555-5555-4555-8555-555555555555";

function baseImpl(opts: { unitQboClassId?: string | null; trailerQboClassId?: string | null; classRowExists?: boolean }) {
  let postingLineIdx = 0;
  return async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM accounting.posting_batches")) return { rows: [] };
    if (sql.includes("closed_period_cutoff")) return { rows: [{ cutoff: null }] };
    if (sql.includes("role_key = $1")) return { rows: [{ account_id: "cash-role-acct" }] };
    if (sql.includes("FROM mdata.units")) {
      return { rows: opts.unitQboClassId ? [{ qbo_class_id: opts.unitQboClassId }] : [] };
    }
    if (sql.includes("FROM mdata.equipment")) {
      return { rows: opts.trailerQboClassId ? [{ qbo_class_id: opts.trailerQboClassId }] : [] };
    }
    if (sql.includes("FROM catalogs.classes")) {
      return { rows: opts.classRowExists === false ? [] : [{ id: RESOLVED_CLASS_ID }] };
    }
    if (sql.includes("INSERT INTO accounting.posting_batches")) return { rows: [{ id: "batch-class" }] };
    if (sql.includes("INSERT INTO accounting.journal_entries")) return { rows: [{ id: "je-class" }] };
    if (sql.includes("INSERT INTO accounting.journal_entry_postings")) {
      postingLineIdx += 1;
      return { rows: [{ id: `jep-class-${postingLineIdx}` }] };
    }
    return { rows: [] };
  };
}

describe("fuel-posting poster.service class resolution (unit/trailer)", () => {
  it("resolves class_id from the unit's qbo_class_id and stamps both posting lines", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "expense-acct", posting_side: "debit" });
    mockQuery.mockImplementation(baseImpl({ unitQboClassId: "QBO-CLASS-UNIT-1" }));

    const result = await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-1",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      unit_id: UNIT_ID,
    });

    expect(result.result).toBe("posted");
    const postingLineCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(postingLineCalls).toHaveLength(2);
    // class_id is the last positional param ($11) in both INSERTs.
    expect(postingLineCalls[0]?.[1]).toContain(RESOLVED_CLASS_ID);
    expect(postingLineCalls[1]?.[1]).toContain(RESOLVED_CLASS_ID);
    expect(result.account_resolution_trace[0]).toMatchObject({
      class_id: RESOLVED_CLASS_ID,
      class_resolution: "unit.qbo_class_id",
    });
  });

  it("falls back to the trailer's qbo_class_id when no unit_id is given", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "expense-acct", posting_side: "debit" });
    mockQuery.mockImplementation(baseImpl({ trailerQboClassId: "QBO-CLASS-TRAILER-1" }));

    const result = await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-2",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      trailer_id: TRAILER_ID,
    });

    expect(result.account_resolution_trace[0]).toMatchObject({
      class_id: RESOLVED_CLASS_ID,
      class_resolution: "trailer.qbo_class_id",
    });
  });

  it("posts with a null class_id (never throws) when neither unit nor trailer resolves a class", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "expense-acct", posting_side: "debit" });
    mockQuery.mockImplementation(baseImpl({}));

    const result = await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-3",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      unit_id: UNIT_ID,
    });

    expect(result.result).toBe("posted");
    const postingLineCalls = mockQuery.mock.calls.filter(([sql]) =>
      String(sql).includes("INSERT INTO accounting.journal_entry_postings")
    );
    expect(postingLineCalls[0]?.[1]).toContain(null);
    expect(result.account_resolution_trace[0]).toMatchObject({ class_id: null, class_resolution: "unresolved" });
  });

  it("scopes unit/equipment class lookups by owner/lease (never operating_company_id)", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "expense-acct", posting_side: "debit" });
    mockQuery.mockImplementation(baseImpl({ unitQboClassId: "QBO-CLASS-UNIT-1" }));

    await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-scope-unit",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      unit_id: UNIT_ID,
    });

    const unitSql = String(mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM mdata.units"))?.[0] ?? "");
    expect(unitSql).toMatch(/owner_company_id/);
    expect(unitSql).toMatch(/currently_leased_to_company_id/);
    expect(unitSql).not.toMatch(/operating_company_id/);

    mockQuery.mockReset();
    mockQuery.mockImplementation(baseImpl({ trailerQboClassId: "QBO-CLASS-TRAILER-1" }));
    await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-scope-trailer",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      trailer_id: TRAILER_ID,
    });

    const equipSql = String(
      mockQuery.mock.calls.find(([sql]) => String(sql).includes("FROM mdata.equipment"))?.[0] ?? ""
    );
    expect(equipSql).toMatch(/owner_company_id/);
    expect(equipSql).toMatch(/currently_leased_to_company_id/);
    expect(equipSql).not.toMatch(/operating_company_id/);
  });

  it("still posts the JE when class lookup throws (ACCT-F5024 never abort)", async () => {
    mockQuery.mockReset();
    mockResolveAccountForCategory.mockReset();
    mockResolveAccountForCategory.mockResolvedValue({ account_id: "expense-acct", posting_side: "debit" });
    mockQuery.mockImplementation(async (sql: string) => {
      if (String(sql).includes("FROM mdata.units") || String(sql).includes("FROM mdata.equipment")) {
        throw new Error('column "operating_company_id" does not exist');
      }
      return baseImpl({})(sql);
    });

    const result = await postFuelExpenseFromEvent({
      operating_company_id: OPCO,
      actor_user_id: "22222222-2222-4222-8222-222222222222",
      fuel_event_id: "evt-fuel-class-throw",
      fuel_kind: "diesel",
      posted_at: "2026-05-23T12:00:00.000Z",
      amount_cents: 5000,
      posting_path: "company_direct",
      company_direct_credit: "cash",
      trailer_id: TRAILER_ID,
    });

    expect(result.result).toBe("posted");
    expect(result.account_resolution_trace[0]).toMatchObject({ class_id: null, class_resolution: "unresolved" });
  });
});
