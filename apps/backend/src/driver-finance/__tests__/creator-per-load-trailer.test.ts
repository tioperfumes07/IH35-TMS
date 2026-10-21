import { describe, expect, it, vi } from "vitest";

import * as choiceModule from "../creator-trailer-choice.js";

/**
 * LEAD 443.203 (20:22Z, 5851 / 13689) — the company settlement's load table prints a trailer per load: 13678 on fleet
 * trailer 10209, 13689 on customer / broker trailer 10204. Before, every load took the settlement-level trailer and 13689
 * was born on 10209. creatorLoadTrailerChoice decides each load from its own printed trailer. FAILS on main (no per-load
 * choice exists).
 */

const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FLEET_10209 = "99999999-9999-4999-8999-999999999999";

const client = {
  query: vi.fn(async (sql: string, v: unknown[] = []) => {
    if (/FROM mdata\.equipment/.test(sql)) return { rows: String(v[1]).trim() === "10209" ? [{ id: FLEET_10209 }] : [] };
    return { rows: [] };
  }),
};
const draft = { operating_company_id: OPCO, trailer_equipment_number: "10209", loads: [] } as never;

describe("LEAD 443.203 — each Creator load takes the trailer printed on its own row", () => {
  it("a load row printing customer trailer 10204 is a customer trailer, not the settlement's fleet 10209", async () => {
    const perLoad = (choiceModule as Record<string, unknown>).creatorLoadTrailerChoice as
      | ((c: unknown, d: unknown, l: unknown) => Promise<unknown>)
      | undefined;
    expect(typeof perLoad).toBe("function");
    expect(await perLoad!(client, draft, { trailer_equipment_number: "10204" })).toEqual({ kind: "customer", trailer_number: "10204" });
    expect(await perLoad!(client, draft, { trailer_equipment_number: " 10209 " })).toEqual({ kind: "company", equipment_id: FLEET_10209 });
  });

  it("a load row printing no trailer takes the settlement's choice", async () => {
    const perLoad = (choiceModule as Record<string, unknown>).creatorLoadTrailerChoice as (c: unknown, d: unknown, l: unknown) => Promise<unknown>;
    expect(await perLoad(client, draft, {})).toEqual({ kind: "company", equipment_id: FLEET_10209 });
  });
});
