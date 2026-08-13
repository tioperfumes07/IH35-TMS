import { describe, expect, it, vi } from "vitest";
import { suggestLoadForExpense } from "../load-lookup.service.js";

// RANK6-UNIFY-SUGGEST-LOAD-TRAILER (trip-wiring rank 6, final) — trailer_id was declared on
// SuggestLoadInput and accepted by every caller (load-lookup.routes.ts querySchema) but never read
// in either query body. Mutation-provable: remove the resolveUnitIdFromTrailer call (or its
// company-scope predicate) and the "exact match via trailer" case below fails — the exact-match
// query never runs with a unit_id at all, so it falls through to fuzzy or null.

const OPCO = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const TRAILER_ID = "33333333-3333-4333-8333-333333333333";
const RESOLVED_UNIT_ID = "44444444-4444-4444-8444-444444444444";
const EXPLICIT_UNIT_ID = "55555555-5555-4555-8555-555555555555";

function mockClient(opts: { equipmentRow?: { current_unit_id: string | null } | null; exactMatchRow?: { id: string; load_number: string } | null }) {
  const query = vi.fn(async (sql: string, values?: unknown[]) => {
    if (sql.includes("FROM mdata.equipment")) {
      return { rows: opts.equipmentRow ? [opts.equipmentRow] : [] };
    }
    if (sql.includes("assigned_unit_id = $3")) {
      return { rows: opts.exactMatchRow ? [opts.exactMatchRow] : [] };
    }
    // fuzzy (driver-only) fallback
    return { rows: [] };
  });
  return { query };
}

describe("suggestLoadForExpense — trailer_id resolver (rank 6)", () => {
  it("resolves unit_id from the trailer's current_unit_id and feeds it into the exact-match query", async () => {
    const client = mockClient({
      equipmentRow: { current_unit_id: RESOLVED_UNIT_ID },
      exactMatchRow: { id: "load-1", load_number: "L-0001" },
    });

    const result = await suggestLoadForExpense(client, {
      operating_company_id: OPCO,
      driver_id: DRIVER_ID,
      trailer_id: TRAILER_ID,
      transaction_date: "2026-08-12",
    });

    expect(result).toEqual({ load_id: "load-1", load_number: "L-0001", confidence: "exact" });
    const equipmentCall = client.query.mock.calls.find(([sql]) => String(sql).includes("FROM mdata.equipment"));
    expect(equipmentCall?.[1]).toEqual([TRAILER_ID, OPCO]);
    const exactCall = client.query.mock.calls.find(([sql]) => String(sql).includes("assigned_unit_id = $3"));
    // effectiveUnitId (resolved from the trailer) is positional param $3.
    expect(exactCall?.[1]).toEqual([OPCO, DRIVER_ID, RESOLVED_UNIT_ID, "2026-08-12"]);
  });

  it("an explicit unit_id always wins — the trailer lookup is never even queried", async () => {
    const client = mockClient({ exactMatchRow: { id: "load-2", load_number: "L-0002" } });

    await suggestLoadForExpense(client, {
      operating_company_id: OPCO,
      driver_id: DRIVER_ID,
      unit_id: EXPLICIT_UNIT_ID,
      trailer_id: TRAILER_ID,
      transaction_date: "2026-08-12",
    });

    const equipmentCall = client.query.mock.calls.find(([sql]) => String(sql).includes("FROM mdata.equipment"));
    expect(equipmentCall).toBeUndefined();
    const exactCall = client.query.mock.calls.find(([sql]) => String(sql).includes("assigned_unit_id = $3"));
    expect(exactCall?.[1]).toEqual([OPCO, DRIVER_ID, EXPLICIT_UNIT_ID, "2026-08-12"]);
  });

  it("falls through to null when the trailer resolves no current_unit_id and no driver-only fuzzy match exists", async () => {
    const client = mockClient({ equipmentRow: { current_unit_id: null } });

    const result = await suggestLoadForExpense(client, {
      operating_company_id: OPCO,
      driver_id: DRIVER_ID,
      trailer_id: TRAILER_ID,
      transaction_date: "2026-08-12",
    });

    expect(result).toBeNull();
  });

  it("a trailer with no matching mdata.equipment row (wrong company or unknown id) resolves to null, never throws", async () => {
    const client = mockClient({ equipmentRow: null });

    const result = await suggestLoadForExpense(client, {
      operating_company_id: OPCO,
      driver_id: DRIVER_ID,
      trailer_id: TRAILER_ID,
      transaction_date: "2026-08-12",
    });

    expect(result).toBeNull();
  });
});
