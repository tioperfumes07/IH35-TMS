import { afterEach, describe, expect, it, vi } from "vitest";
import {
  parseSaferCsaSnapshot,
  pullAndPersistCsaBasicsForCompany,
} from "./csa-basic-pull.js";

const COMPANY = "11111111-1111-4111-8111-111111111111";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("CSA public-source honesty", () => {
  it("never derives private Hazmat or Crash Indicator BASICs from public text", () => {
    const rows = parseSaferCsaSnapshot(
      "Unsafe Driving 12 34% Hazardous Materials Compliance 98 99% Crash Indicator 88 97%"
    );

    expect(rows.find((row) => row.basic_category === "hazmat_compliance")).toMatchObject({
      score: null,
      pct_percentile: null,
      alert_status: "inconclusive",
    });
    expect(rows.find((row) => row.basic_category === "crash_indicator")).toMatchObject({
      score: null,
      pct_percentile: null,
      alert_status: "inconclusive",
    });
  });

  it("does not persist or mark an all-null SAFER pull successful", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html><body>Carrier snapshot without BASIC metrics</body></html>", { status: 200 }))
    );
    const query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

    await expect(
      pullAndPersistCsaBasicsForCompany(
        { query },
        { operatingCompanyId: COMPANY, usdotNumber: "1234567" }
      )
    ).rejects.toThrow("safer_csa_metrics_unavailable");
    expect(query).not.toHaveBeenCalled();
  });

  it("persists only metrics actually available from the public response", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            "<html><body>Unsafe Driving 12 34% Hazardous Materials Compliance 98 99%</body></html>",
            { status: 200 }
          )
      )
    );
    const query = vi.fn(async () => ({ rows: [], rowCount: 1 }));

    const result = await pullAndPersistCsaBasicsForCompany(
      { query },
      { operatingCompanyId: COMPANY, usdotNumber: "1234567" }
    );

    expect(result.available_metric_count).toBeGreaterThan(0);
    expect(query).toHaveBeenCalled();
    for (const call of query.mock.calls) {
      expect(call[1]?.[2]).not.toBe("hazmat_compliance");
      expect(call[1]?.[2]).not.toBe("crash_indicator");
    }
  });
});
