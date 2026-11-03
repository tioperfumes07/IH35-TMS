import { describe, expect, it } from "vitest";
import { applyCounterpartyPersonFlag, resolvePersonCounterpartyIds } from "./match-candidate-person-payee.js";

// D071 (register row 247): the Match drawer needs a person/organisation fact per candidate payee.
describe("match candidate person payee flag (D071)", () => {
  it("stamps counterparty_is_person only for ids in the resolved person set", () => {
    const out = applyCounterpartyPersonFlag(
      [
        { counterparty_id: "drv-vendor", counterparty_kind: "vendor" },
        { counterparty_id: "org-vendor", counterparty_kind: "vendor" },
        { counterparty_id: null, counterparty_kind: null },
      ],
      new Set(["drv-vendor"]),
    );
    expect(out.map((c) => c.counterparty_is_person)).toEqual([true, false, false]);
  });

  it("queries same-company vendors (driver payees) and drivers, deduped, and skips the query when empty", async () => {
    const calls: Array<{ sql: string; params: unknown[] }> = [];
    const client = {
      query: async (sql: string, params: unknown[]) => {
        calls.push({ sql, params });
        return { rows: [{ id: "drv-vendor" }] };
      },
    };
    const ids = await resolvePersonCounterpartyIds(client, "co-1", ["drv-vendor", "drv-vendor", "org-vendor", ""]);
    expect([...ids]).toEqual(["drv-vendor"]);
    expect(calls).toHaveLength(1);
    expect(calls[0].params).toEqual(["co-1", ["drv-vendor", "org-vendor"]]);
    expect(calls[0].sql).toMatch(/v\.operating_company_id = \$1::uuid/);
    expect(calls[0].sql).toMatch(/d\.operating_company_id = \$1::uuid/);
    expect(calls[0].sql).toMatch(/v\.driver_id IS NOT NULL/);

    const none = await resolvePersonCounterpartyIds(client, "co-1", []);
    expect(none.size).toBe(0);
    expect(calls).toHaveLength(1);
  });
});
