/**
 * LEAD 443.185 G7 re-stamp — a fuel row with a load and no trailer takes its load's trailer from the one trailer rule:
 * fill-null only, never reefer, never voided, same company, one audit event per row, no money. Synthetic ids only.
 */
import { describe, expect, it } from "vitest";
import { restampFuelTrailersFromLoad } from "../fuel-trailer-restamp.service.js";

const CO = "00000000-0000-4000-8000-000000000001";
const ACTOR = "99999999-9999-4999-8999-999999999999";

describe("restampFuelTrailersFromLoad", () => {
  it("stamps through the one trailer rule, fill-null, non-reefer, and audits each row", async () => {
    const calls: Array<{ sql: string; values?: unknown[] }> = [];
    const client = {
      query: async (sql: string, values?: unknown[]) => {
        calls.push({ sql, values });
        if (/UPDATE fuel\.fuel_transactions/.test(sql)) return { rows: [{ fuel_transaction_id: "f1", load_id: "l1", trailer_id: "t1" }] };
        return { rows: [] };
      },
    };
    const out = await restampFuelTrailersFromLoad(client as never, { operatingCompanyId: CO, actorUserId: ACTOR, fuelTransactionIds: ["f1", "f2"] });
    expect(out).toEqual([{ fuel_transaction_id: "f1", load_id: "l1", trailer_id: "t1" }]);
    const up = calls[0]!;
    expect(up.sql).toMatch(/ft\.trailer_id IS NULL/);
    expect(up.sql).toMatch(/ft\.fuel_type::text <> 'reefer_diesel'/);
    expect(up.sql).toMatch(/ft\.voided_at IS NULL/);
    expect(up.sql).toMatch(/dispatch\.load_assignment_history/);
    expect(up.sql).toMatch(/trailer_source IS DISTINCT FROM 'customer'/);
    expect(up.sql).not.toMatch(/journal_entry|amount|total_cost/);
    expect(up.values).toEqual([CO, ["f1", "f2"]]);
    const audits = calls.filter((c) => /audit\.append_event/.test(c.sql));
    expect(audits).toHaveLength(1);
    expect(audits[0]!.values?.[0]).toBe("fuel.trailer_restamped_from_load");
  });

  it("no ids = no write", async () => {
    const client = { query: async () => { throw new Error("must not query"); } };
    expect(await restampFuelTrailersFromLoad(client as never, { operatingCompanyId: CO, actorUserId: ACTOR, fuelTransactionIds: [] })).toEqual([]);
  });
});
