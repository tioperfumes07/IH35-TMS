import { describe, expect, it } from "vitest";
import { provenanceFromRow, resolveLaneMileage, type LaneMileageRow } from "../lane-mileage.service.js";

function row(partial: Partial<LaneMileageRow>): LaneMileageRow {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    origin_city: "Laredo",
    origin_state: "TX",
    origin_postal_code: null,
    dest_city: "Denton",
    dest_state: "TX",
    dest_postal_code: null,
    practical_miles: 456.7,
    short_miles: 452.2,
    empty_miles: 0,
    n_practical: 34,
    n_short: 34,
    practical_spread: 12,
    confidence: "High",
    autofill_allowed: true,
    source: "History",
    ...partial,
  };
}

function clientFrom(rowsByKind: { zip?: LaneMileageRow; city?: LaneMileageRow; reverse?: LaneMileageRow }) {
  return {
    query: async (_sql: string, values?: unknown[]) => {
      const sql = _sql.replace(/\s+/g, " ");
      if (sql.includes("origin_postal_code = $2")) {
        return { rows: rowsByKind.zip ? [rowsByKind.zip] : [] };
      }
      if (values && values[1] === "Chicago" && values[3] === "Laredo") {
        return { rows: rowsByKind.reverse ? [rowsByKind.reverse] : [] };
      }
      if (sql.includes("lower(origin_city) = lower($2)")) {
        const origin = String(values?.[1] ?? "");
        const dest = String(values?.[3] ?? "");
        if (origin === "Chicago" && dest === "Laredo") return { rows: rowsByKind.reverse ? [rowsByKind.reverse] : [] };
        return { rows: rowsByKind.city ? [rowsByKind.city] : [] };
      }
      return { rows: [] };
    },
  };
}

describe("resolveLaneMileage", () => {
  it("fills only when autofill is allowed (Laredo to Denton)", async () => {
    const result = await resolveLaneMileage(clientFrom({ city: row({}) }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.autofill_allowed).toBe(true);
    expect(result.match).toBe("City match");
    expect(result.practical_miles).toBe(456.7);
    expect(result.provenance).toMatch(/34 prior runs/);
  });

  it("returns a hint and blocks fill on Check ZIP (Laredo to Chicago)", async () => {
    const chicago = row({
      dest_city: "Chicago",
      dest_state: "IL",
      practical_miles: 1353.7,
      short_miles: 1339.1,
      n_practical: 123,
      practical_spread: 351,
      confidence: "Check ZIP",
      autofill_allowed: false,
    });
    const result = await resolveLaneMileage(clientFrom({ city: chicago }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Chicago",
      dest_state: "IL",
    });
    expect(result.autofill_allowed).toBe(false);
    expect(result.provenance).toMatch(/Enter ZIP to narrow/);
    expect(result.provenance).toMatch(/spread 351/);
  });

  it("labels reverse as a hint and never sets autofill", async () => {
    const reverse = row({
      origin_city: "Chicago",
      origin_state: "IL",
      dest_city: "Laredo",
      dest_state: "TX",
      practical_miles: 1354.6,
      n_practical: 17,
      autofill_allowed: true,
      confidence: "High",
    });
    const result = await resolveLaneMileage(clientFrom({ reverse }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Chicago",
      dest_state: "IL",
    });
    expect(result.match).toBe("From the reverse lane");
    expect(result.autofill_allowed).toBe(false);
    expect(result.provenance).toMatch(/From the reverse lane/);
  });

  it("returns New lane for same-city (Laredo to Laredo)", async () => {
    const result = await resolveLaneMileage(clientFrom({ city: row({}) }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Laredo",
      dest_state: "TX",
    });
    expect(result.match).toBe("New lane");
    expect(result.autofill_allowed).toBe(false);
    expect(result.provenance).toBe("New lane. Enter the miles.");
  });

  it("never 500-shapes a miss: empty cities are New lane", async () => {
    const result = await resolveLaneMileage(clientFrom({}), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.match).toBe("New lane");
  });
});

describe("lane-mileage HTTP", () => {
  it("registers GET /api/v1/dispatch/lane-mileage on the dispatch load router", async () => {
    const { readFileSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const here = dirname(fileURLToPath(import.meta.url));
    const src = readFileSync(join(here, "../loads.routes.ts"), "utf8");
    expect(src).toContain('app.get("/api/v1/dispatch/lane-mileage"');
    expect(src.indexOf('app.get("/api/v1/dispatch/lane-mileage"')).toBeLessThan(
      src.indexOf('app.get("/api/v1/dispatch/loads/:id"')
    );
    expect(src).toContain("lane_mileage_lookup_failed");
    expect(src).toContain("reply.code(503)");
    expect(src).not.toMatch(/lane_mileage_lookup_failed[\s\S]{0,500}match:\s*"New lane"/);
  });
});
