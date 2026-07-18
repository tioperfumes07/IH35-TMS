import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSaferCsaSnapshot,
  pullAndPersistCsaBasicsForCompany,
} from "./csa-basic-pull.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";
const SAFER_COMPANY_SNAPSHOT = readFileSync(
  fileURLToPath(new URL("./__fixtures__/safer-company-snapshot.html", import.meta.url)),
  "utf8"
);

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CSA public-source honesty", () => {
  it("returns every BASIC unavailable for a real-source-shaped SAFER Company Snapshot", () => {
    const rows = parseSaferCsaSnapshot(SAFER_COMPANY_SNAPSHOT);

    expect(rows).toHaveLength(7);
    expect(rows).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ basic_category: "unsafe_driving" }),
        expect.objectContaining({ basic_category: "hos_compliance" }),
        expect.objectContaining({ basic_category: "vehicle_maintenance" }),
        expect.objectContaining({ basic_category: "hazmat_compliance" }),
        expect.objectContaining({ basic_category: "crash_indicator" }),
      ])
    );
    for (const row of rows) {
      expect(row).toMatchObject({
        score: null,
        pct_percentile: null,
        alert_status: "inconclusive",
      });
    }
  });

  it("does not fetch, persist, or mark a public SAFER pull successful", async () => {
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      pullAndPersistCsaBasicsForCompany(
        { query },
        { operatingCompanyId: COMPANY, usdotNumber: "1234567" }
      )
    ).rejects.toThrow("public_csa_basic_source_unavailable");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(query).not.toHaveBeenCalled();
  });

  it("never treats nearby SAFER OOS percentages as SMS measures or percentiles", () => {
    const rows = parseSaferCsaSnapshot(SAFER_COMPANY_SNAPSHOT);
    expect(rows.some((row) => row.score != null || row.pct_percentile != null)).toBe(false);
  });
});
