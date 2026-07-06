import { describe, expect, it } from "vitest";
import { calculateStateTaxes } from "./ifta-tax-calculator.js";
import { totalPersonalConveyanceMiles, type PersonalConveyanceUnitRow } from "./ifta-personal-conveyance-aggregator.js";
import { loadJurisdictionCatalog } from "./ifta-jurisdiction-catalog.js";

describe("calculateStateTaxes — BLOCK-03 TRIP methodology extension", () => {
  it("stays byte-for-byte backward compatible when no override/PC args are passed", () => {
    const result = calculateStateTaxes({
      quarter: 2,
      year: 2026,
      stateMiles: [{ state: "TX", miles: 1000 }],
      stateGallons: [{ state: "TX", gallons: 100 }],
    });
    const tx = result.rows.find((r) => r.state === "TX");
    expect(tx?.is_ifta_jurisdiction).toBe(true);
    expect(tx?.personal_conveyance_deduction_miles).toBe(0);
    expect(tx?.tax_owed).toBe(0); // net_taxable_gallons is 0 in this hand example (10 mpg, 100 gal purchased)
  });

  it("marks a non-IFTA jurisdiction (Mexico) as untaxed but keeps its miles visible", () => {
    const result = calculateStateTaxes({
      quarter: 2,
      year: 2026,
      stateMiles: [
        { state: "TX", miles: 1000 },
        { state: "TAM", miles: 200 },
      ],
      stateGallons: [{ state: "TX", gallons: 100 }],
      jurisdictionOverrides: new Map([
        ["TX", { taxRatePerGallon: 0.2, isIftaJurisdiction: true }],
        ["TAM", { taxRatePerGallon: 0, isIftaJurisdiction: false }],
      ]),
    });
    const tam = result.rows.find((r) => r.state === "TAM");
    expect(tam?.is_ifta_jurisdiction).toBe(false);
    expect(tam?.tax_owed).toBe(0);
    expect(tam?.miles_in_state).toBe(200); // miles still tracked for visibility
    expect(tam?.taxable_gallons).toBe(0); // never taxed
  });

  it("nets personal-conveyance miles proportionally across state buckets, never below zero", () => {
    const result = calculateStateTaxes({
      quarter: 2,
      year: 2026,
      stateMiles: [
        { state: "TX", miles: 800 },
        { state: "OK", miles: 200 },
      ],
      stateGallons: [
        { state: "TX", gallons: 0 },
        { state: "OK", gallons: 0 },
      ],
      totalPersonalConveyanceMiles: 100, // 10% of the 1000 gross fleet miles
    });
    const tx = result.rows.find((r) => r.state === "TX");
    const ok = result.rows.find((r) => r.state === "OK");
    // TX has 80% share -> 80 miles deducted; OK has 20% share -> 20 miles deducted.
    expect(tx?.personal_conveyance_deduction_miles).toBe(80);
    expect(ok?.personal_conveyance_deduction_miles).toBe(20);
  });

  it("never deducts more personal-conveyance miles than a state's own gross miles", () => {
    const result = calculateStateTaxes({
      quarter: 2,
      year: 2026,
      stateMiles: [{ state: "TX", miles: 50 }],
      stateGallons: [{ state: "TX", gallons: 0 }],
      totalPersonalConveyanceMiles: 10000, // absurdly large vs the 50-mile bucket
    });
    const tx = result.rows.find((r) => r.state === "TX");
    expect(tx?.personal_conveyance_deduction_miles).toBe(50);
  });
});

describe("aggregatePersonalConveyanceMiles / totalPersonalConveyanceMiles", () => {
  it("sums per-unit personal-conveyance miles across the fleet", () => {
    const rows: PersonalConveyanceUnitRow[] = [
      { unit_id: "u1", miles: 30 },
      { unit_id: "u2", miles: 15.5 },
    ];
    expect(totalPersonalConveyanceMiles(rows)).toBe(45.5);
  });

  it("returns 0 for an empty fleet", () => {
    expect(totalPersonalConveyanceMiles([])).toBe(0);
  });
});

describe("loadJurisdictionCatalog", () => {
  it("marks a jurisdiction found in reference.non_ifta_jurisdictions as non-IFTA regardless of a rate row", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("reference.ifta_tax_rates")) {
          return { rows: [{ jurisdiction_code: "TAM", tax_rate_per_gallon: "0.5" }] }; // should be ignored
        }
        if (sql.includes("reference.non_ifta_jurisdictions")) {
          return { rows: [{ jurisdiction_code: "TAM" }] };
        }
        return { rows: [] };
      },
    };
    const catalog = await loadJurisdictionCatalog(client, 2, 2026, ["TX", "TAM"]);
    expect(catalog.get("TAM")).toEqual({
      jurisdictionCode: "TAM",
      taxRatePerGallon: 0,
      isIftaJurisdiction: false,
      source: "non_ifta_catalog",
    });
  });

  it("prefers the DB catalog rate over the JSON fallback when both exist", async () => {
    const client = {
      query: async (sql: string) => {
        if (sql.includes("reference.ifta_tax_rates")) {
          return { rows: [{ jurisdiction_code: "TX", tax_rate_per_gallon: "0.99" }] };
        }
        return { rows: [] };
      },
    };
    const catalog = await loadJurisdictionCatalog(client, 2, 2026, ["TX"]);
    expect(catalog.get("TX")?.taxRatePerGallon).toBe(0.99);
    expect(catalog.get("TX")?.source).toBe("db_catalog");
  });

  it("falls back to the JSON rate table when the DB catalog has no row (migration not yet run)", async () => {
    const client = { query: async () => ({ rows: [] }) };
    const catalog = await loadJurisdictionCatalog(client, 1, 2026, ["TX"]);
    expect(catalog.get("TX")?.source).toBe("json_fallback");
    expect(catalog.get("TX")?.taxRatePerGallon).toBeGreaterThan(0);
  });

  it("falls back gracefully (json_fallback) when the DB catalog tables don't exist at all", async () => {
    const client = {
      query: async () => {
        throw new Error('relation "reference.ifta_tax_rates" does not exist');
      },
    };
    const catalog = await loadJurisdictionCatalog(client, 1, 2026, ["TX"]);
    expect(catalog.get("TX")?.source).toBe("json_fallback");
  });
});
