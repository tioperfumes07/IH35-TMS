/**
 * ROSTER DUPLICATE DETECTION — the three shapes that actually reached prod.
 *
 * These are not invented cases. All three are ACTIVE same-name pairs found on TRANSP 2026-08-03, and
 * each defeats a different identifier-based rule — which is the whole argument for matching on name:
 *
 *   CARLOS GALAVIZ                 identical CDL LFD01237194        (exact CDL match SHOULD catch it)
 *   JOSE MANUEL MEJIA OLMOS        CDL NULL on both rows            (no identifier to match at all)
 *   JUAN PABLO HERNANDEZ ESTRADA   TAMP310697 vs TAMP310637         (one digit apart — a typo)
 *
 * The test asserts the SQL the service builds, because the query is the behaviour here: which columns
 * are compared, that comparison is normalised on BOTH sides, that it is scoped to one entity, and that
 * deactivated rows are excluded. A test that only checked "returns rows" would pass against a query
 * that had quietly dropped its entity scope.
 */
import { describe, expect, it, vi } from "vitest";

import { findRosterDuplicates } from "../driver-roster-duplicate.service.js";

const COMPANY = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";

function clientReturning(rows: unknown[]) {
  const query = vi.fn().mockResolvedValue({ rows });
  return { client: { query } as never, query };
}

describe("findRosterDuplicates", () => {
  it("scopes to ONE operating company — a driver may legitimately hold a row in TRANSP and USMCA", async () => {
    const { client, query } = clientReturning([]);
    await findRosterDuplicates(client, { operating_company_id: COMPANY, first_name: "CARLOS", last_name: "GALAVIZ" });
    const [sql, values] = query.mock.calls[0];
    expect(sql).toContain("d.operating_company_id = $1::uuid");
    expect(values[0]).toBe(COMPANY);
  });

  it("excludes deactivated and archived rows — that is a REHIRE, handled elsewhere", async () => {
    const { client, query } = clientReturning([]);
    await findRosterDuplicates(client, { operating_company_id: COMPANY, first_name: "A", last_name: "B" });
    const [sql] = query.mock.calls[0];
    expect(sql).toContain("d.deactivated_at IS NULL");
    expect(sql).toContain("d.archived_at IS NULL");
  });

  it("compares the full name normalised on BOTH sides, not just the input", async () => {
    const { client, query } = clientReturning([]);
    await findRosterDuplicates(client, { operating_company_id: COMPANY, first_name: "  jose manuel ", last_name: "mejia  olmos" });
    const [sql, values] = query.mock.calls[0];
    // Input normalised: collapsed whitespace, upper-cased.
    expect(values[3]).toBe("JOSE MANUEL MEJIA  OLMOS".replace(/\s+/g, " "));
    // Column side normalised the same way, or the comparison is one-sided and misses real matches.
    expect(sql).toContain("upper(regexp_replace(trim(concat_ws(' ', d.first_name, d.last_name))");
  });

  it("JOSE MANUEL MEJIA OLMOS: still queries when BOTH CDL and CURP are absent (name is all there is)", async () => {
    const { client, query } = clientReturning([]);
    const found = await findRosterDuplicates(client, {
      operating_company_id: COMPANY,
      first_name: "JOSE MANUEL",
      last_name: "MEJIA OLMOS",
      cdl_number: null,
      curp: null,
    });
    expect(query).toHaveBeenCalledTimes(1);
    const [, values] = query.mock.calls[0];
    expect(values[1]).toBeNull(); // cdl
    expect(values[2]).toBeNull(); // curp
    expect(values[3]).toBe("JOSE MANUEL MEJIA OLMOS");
    expect(found).toEqual([]);
  });

  it("CARLOS GALAVIZ: an identical CDL is reported as cdl_exact, the strongest signal", async () => {
    const { client } = clientReturning([
      {
        driver_id: "a10a4320-2bc9-47dc-9e10-e17642710f9c",
        full_name: "CARLOS GALAVIZ",
        cdl_number: "LFD01237194",
        created_at: "2026-05-31",
        matched_on: "cdl_exact",
      },
    ]);
    const found = await findRosterDuplicates(client, {
      operating_company_id: COMPANY,
      first_name: "CARLOS",
      last_name: "GALAVIZ",
      cdl_number: "LFD01237194",
    });
    expect(found).toHaveLength(1);
    expect(found[0].matched_on).toBe("cdl_exact");
  });

  it("JUAN PABLO HERNANDEZ ESTRADA: a one-digit CDL difference still matches on name", async () => {
    // TAMP310697 vs TAMP310637 — no exact-identifier rule can catch this pair.
    const { client, query } = clientReturning([
      {
        driver_id: "a20c4ac9-59a4-4256-92be-9a7c40d6db4d",
        full_name: "JUAN PABLO HERNANDEZ ESTRADA",
        cdl_number: "TAMP310697",
        created_at: "2026-05-31",
        matched_on: "name_exact",
      },
    ]);
    const found = await findRosterDuplicates(client, {
      operating_company_id: COMPANY,
      first_name: "JUAN PABLO",
      last_name: "HERNANDEZ ESTRADA",
      cdl_number: "TAMP310637",
    });
    const [sql] = query.mock.calls[0];
    // The name arm must be OR'd in, or the differing CDL would make this miss.
    expect(sql).toContain("OR ($4::text IS NOT NULL");
    expect(found[0].matched_on).toBe("name_exact");
  });

  it("returns nothing, and issues NO query, when there is nothing to match on", async () => {
    const { client, query } = clientReturning([]);
    const found = await findRosterDuplicates(client, { operating_company_id: COMPANY });
    expect(found).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });

  it("matches CDL state only when one is supplied, so a missing state does not suppress the match", async () => {
    const { client, query } = clientReturning([]);
    await findRosterDuplicates(client, { operating_company_id: COMPANY, cdl_number: "LFD01237194" });
    const [sql, values] = query.mock.calls[0];
    expect(values[4]).toBeNull();
    expect(sql).toContain("($5::text IS NULL OR upper(trim(d.cdl_state)) = $5)");
  });
});
