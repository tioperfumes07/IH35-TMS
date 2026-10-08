import { describe, expect, it, vi } from "vitest";

// ROUND 441.15 — the one-shot server-side backfill trigger. Parsing is strict: a malformed value is ignored, never guessed.
vi.mock("../../auth/db.js", () => ({ withLuciaBypass: vi.fn() }));

const { parseRelayBackfillOnce, parseRelayOneDayProbe } = await import("./relay-fuel-ingest.cron.js");

describe("parseRelayBackfillOnce", () => {
  it("reads run_id | company code | months", () => {
    expect(parseRelayBackfillOnce("r441-15-usmca-1|USMCA|3")).toEqual({ runId: "r441-15-usmca-1", companyCode: "USMCA", months: 3 });
  });
  it.each([
    ["empty", ""],
    ["no months", "r441-15-usmca-1|USMCA"],
    ["months out of range", "r441-15-usmca-1|USMCA|99"],
    ["zero months", "r441-15-usmca-1|USMCA|0"],
    ["unsafe run id", "drop table;|USMCA|3"],
    ["lower-case company", "r441-15-usmca-1|usmca|3"],
  ])("refuses %s", (_label, raw) => {
    expect(parseRelayBackfillOnce(raw)).toBeNull();
  });
});

describe("parseRelayOneDayProbe — ROUND 441.21-B R1", () => {
  it("reads run_id | company | YYYY-MM-DD", () => {
    expect(parseRelayOneDayProbe("r44121b-oneday-1|USMCA|2026-08-03")).toEqual({
      runId: "r44121b-oneday-1",
      companyCode: "USMCA",
      day: "2026-08-03",
    });
  });
  it.each([
    ["empty", ""],
    ["no day", "r44121b-oneday-1|USMCA"],
    ["bad day", "r44121b-oneday-1|USMCA|08-03-2026"],
    ["lower-case company", "r44121b-oneday-1|usmca|2026-08-03"],
  ])("refuses %s", (_label, raw) => {
    expect(parseRelayOneDayProbe(raw)).toBeNull();
  });
});
