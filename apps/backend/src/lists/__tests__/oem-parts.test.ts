import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { FLEET_BRAND_SOURCES_SQL, fetchFleetBrands, normalizeBrandKey } from "../../lists/oem-parts.brand-match.js";

const here = path.dirname(fileURLToPath(import.meta.url));

describe("oem-parts brand uniqueness constraint", () => {
  it("documents brand + oem_part_number uniqueness in migration SQL", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const migrationPath = path.resolve(here, "../../../../../db/migrations/0342_reference_oem_parts.sql");
    const sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/UNIQUE NULLS NOT DISTINCT \(brand, oem_part_number\)/);
  });
});

describe("oem-parts archived filter contract", () => {
  it("list routes exclude archived rows unless include_archived flag is set", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = path.dirname(fileURLToPath(import.meta.url));
    const routesPath = path.resolve(here, "../../lists/oem-parts.routes.ts");
    const src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/if \(!q\.include_archived\) where\.push\("archived_at IS NULL"\)/);
    expect(src).toMatch(/include_archived: z\.coerce\.boolean\(\)\.optional\(\)/);
  });
});

describe("fleet-brand-match computation", () => {
  it("queries units.make, equipment.make, and equipment.reefer_brand", () => {
    expect(FLEET_BRAND_SOURCES_SQL).toMatch(/mdata\.units/);
    expect(FLEET_BRAND_SOURCES_SQL).toMatch(/mdata\.equipment/);
    expect(FLEET_BRAND_SOURCES_SQL).toMatch(/reefer_brand/);
    expect(FLEET_BRAND_SOURCES_SQL).toMatch(/deactivated_at IS NULL/);
  });

  it("returns normalized fleet brands from fixtures", async () => {
    const query = async () => ({
      rows: [{ brand: "FREIGHTLINER" }, { brand: "PETERBILT" }, { brand: "CARRIER" }, { brand: "WABASH" }],
    });

    const brands = await fetchFleetBrands({ query });
    expect(brands.has("FREIGHTLINER")).toBe(true);
    expect(brands.has("PETERBILT")).toBe(true);
    expect(brands.has("CARRIER")).toBe(true);
    expect(brands.has("WABASH")).toBe(true);
    expect(normalizeBrandKey(" freightliner ")).toBe("FREIGHTLINER");
  });
});

describe("seed-reference-oem-parts idempotency", () => {
  it("uses ON CONFLICT upsert keyed by brand and oem_part_number", () => {
    const seedPath = path.resolve(here, "../../../../../scripts/seed-reference-oem-parts.mjs");
    const manifestPath = path.resolve(here, "../../../../../scripts/data/oem-parts-bootstrap.json");
    const seedSrc = fs.readFileSync(seedPath, "utf8");
    expect(seedSrc).toMatch(/ON CONFLICT \(brand, oem_part_number\) DO UPDATE/);
    const parts = JSON.parse(fs.readFileSync(manifestPath, "utf8")).parts;
    expect(parts.length).toBeGreaterThanOrEqual(50);
    const keys = new Set(parts.map((part: { brand: string; oem_part_number?: string | null }) => `${part.brand}::${part.oem_part_number ?? ""}`));
    expect(keys.size).toBe(parts.length);
  });
});
