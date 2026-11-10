import { describe, expect, it } from "vitest";
import { assertUnitNotActiveOnAnotherLoad, UnitAlreadyActiveOnLoadError } from "./unit-active-load-guard.js";
import { historicalStopWindow } from "./book-load.service.js";

const OCI = "5c854333-6ea5-4faa-af31-67cb272fef80";

function client(rows: Array<{ id: string; load_number: string }>) {
  const calls: Array<{ sql: string; values: unknown[] }> = [];
  return { calls, query: async (sql: string, values: unknown[] = []) => { calls.push({ sql, values }); return { rows: rows as never[] }; } };
}

describe("ACCT-F11108 part 3 — a load that already ran conflicts only with an overlapping in-motion load", () => {
  it("adds the trigger's date-window overlap test only when a historical window is given", async () => {
    const live = client([]);
    await assertUnitNotActiveOnAnotherLoad(live, { operating_company_id: OCI, unit_id: "u-175" });
    expect(live.calls[0]!.sql).not.toContain("daterange");
    const hist = client([]);
    await assertUnitNotActiveOnAnotherLoad(hist, {
      operating_company_id: OCI,
      unit_id: "u-175",
      historical_window: { starts_on: "2026-10-26T05:00:00.000Z", ends_on: "2026-10-29T05:00:00.000Z" },
    });
    const sql = hist.calls[0]!.sql;
    expect(sql).toContain("daterange(");
    expect(sql).toContain("'[]'");
    expect(sql).toMatch(/IS NOT NULL\s+AND NOT \(daterange/);
    expect(hist.calls[0]!.values.slice(-2)).toEqual(["2026-10-26T05:00:00.000Z", "2026-10-29T05:00:00.000Z"]);
  });

  it("still refuses when the database returns an overlapping in-motion load", async () => {
    const c = client([{ id: "l-13727", load_number: "13727" }]);
    await expect(
      assertUnitNotActiveOnAnotherLoad(c, { operating_company_id: OCI, unit_id: "u-175", historical_window: { starts_on: "2026-11-03T05:00:00Z", ends_on: "2026-11-05T05:00:00Z" } }),
    ).rejects.toBeInstanceOf(UnitAlreadyActiveOnLoadError);
  });

  it("the window is the earliest and latest scheduled stop; any undated stop -> no window (strict check)", () => {
    expect(historicalStopWindow([{ scheduled_arrival_at: "2026-10-29T05:00:00.000Z" }, { scheduled_arrival_at: "2026-10-26T05:00:00.000Z" }])).toEqual({
      starts_on: "2026-10-26T05:00:00.000Z",
      ends_on: "2026-10-29T05:00:00.000Z",
    });
    expect(historicalStopWindow([{ scheduled_arrival_at: "2026-10-26T05:00:00.000Z" }, { scheduled_arrival_at: null }])).toBeNull();
    expect(historicalStopWindow([])).toBeNull();
  });
});
