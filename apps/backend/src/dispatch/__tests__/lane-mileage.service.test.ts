import { describe, expect, it } from "vitest";
import {
  fillConfidenceFromRow,
  listLaneMileageReference,
  mileageSourceFromFill,
  provenanceFromRow,
  resolveLaneMileage,
  type LaneMileageRow,
} from "../lane-mileage.service.js";

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
    short_miles_untrustworthy: false,
    short_miles_untrustworthy_reason: null,
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
        if (origin === "Chicago" && dest === "Laredo") {
          return { rows: rowsByKind.reverse ? [rowsByKind.reverse] : [] };
        }
        return { rows: rowsByKind.city ? [rowsByKind.city] : [] };
      }
      return { rows: [] };
    },
  };
}

describe("resolveLaneMileage — GO-16 Rev C (fill all bands)", () => {
  it("High: fills and stays high (Laredo → Denton)", async () => {
    const result = await resolveLaneMileage(clientFrom({ city: row({}) }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.fills).toBe(true);
    expect(result.fill_confidence).toBe("high");
    expect(result.autofill_allowed).toBe(true); // audit mirror unchanged
    expect(result.practical_miles).toBe(456.7);
    expect(result.provenance).toMatch(/From history/);
    expect(mileageSourceFromFill(result.fill_confidence)).toBe("History");
  });

  it("Thin: fills with verify (was blocked under Rev B)", async () => {
    const thin = row({
      confidence: "Thin",
      autofill_allowed: false,
      n_practical: 1,
      practical_spread: 2,
    });
    const result = await resolveLaneMileage(clientFrom({ city: thin }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.fills).toBe(true);
    expect(result.fill_confidence).toBe("verify");
    expect(result.autofill_allowed).toBe(false); // DB flag untouched / audit
    expect(result.provenance).toMatch(/verify/i);
    expect(mileageSourceFromFill(result.fill_confidence)).toBe("History");
  });

  it("Check ZIP: fills but flagged (Laredo → Chicago)", async () => {
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
    expect(result.fills).toBe(true);
    expect(result.fill_confidence).toBe("check_zip");
    expect(result.autofill_allowed).toBe(false);
    expect(result.provenance).toMatch(/ZIP mismatch/i);
    expect(result.provenance).toMatch(/351/);
    expect(mileageSourceFromFill(result.fill_confidence)).toBe("History");
  });

  it("reverse lane: fills and labelled reverse (Rev C contract change from Rev B)", async () => {
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
    expect(result.fills).toBe(true);
    expect(result.fill_confidence).toBe("reverse");
    expect(result.provenance).toMatch(/reverse lane/i);
    expect(mileageSourceFromFill(result.fill_confidence)).toBe("History");
    expect(result.short_miles_untrustworthy).toBe(false);
    expect(result.short_miles_untrustworthy_reason).toBeNull();
  });

  it("passes MILES-INVERT-01 untrustworthy flags from the catalog row", async () => {
    const flagged = row({
      short_miles_untrustworthy: true,
      short_miles_untrustworthy_reason: "short_exceeds_practical+reverse_lane_short_differs_over_100mi",
    });
    const result = await resolveLaneMileage(clientFrom({ city: flagged }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.short_miles_untrustworthy).toBe(true);
    expect(result.short_miles_untrustworthy_reason).toContain("reverse_lane_short_differs_over_100mi");
  });

  it("no miles on row: does not fill", async () => {
    const empty = row({ practical_miles: null, short_miles: null, confidence: "Thin", autofill_allowed: false });
    const result = await resolveLaneMileage(clientFrom({ city: empty }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.fills).toBe(false);
    expect(result.fill_confidence).toBe("none");
    expect(result.practical_miles).toBeNull();
  });

  it("unknown lane: New lane, no fill", async () => {
    const result = await resolveLaneMileage(clientFrom({}), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Nowhere",
      dest_state: "TX",
    });
    expect(result.match).toBe("New lane");
    expect(result.fills).toBe(false);
    expect(result.provenance).toBe("New lane. Enter the miles.");
  });

  it("same-city: New lane", async () => {
    const result = await resolveLaneMileage(clientFrom({ city: row({}) }), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "Laredo",
      origin_state: "TX",
      dest_city: "Laredo",
      dest_state: "TX",
    });
    expect(result.match).toBe("New lane");
    expect(result.fills).toBe(false);
  });

  it("empty cities: New lane (never 500-shape)", async () => {
    const result = await resolveLaneMileage(clientFrom({}), "5c854333-6ea5-4faa-af31-67cb272fef80", {
      origin_city: "",
      origin_state: "TX",
      dest_city: "Denton",
      dest_state: "TX",
    });
    expect(result.match).toBe("New lane");
  });

  it("stray High with autofill_allowed=false still fills as high (fix the DATA row, not the code)", () => {
    const stray = row({ confidence: "High", autofill_allowed: false });
    expect(fillConfidenceFromRow(stray, "City match")).toBe("high");
    expect(provenanceFromRow(stray, "City match")).toMatch(/From history/);
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

describe("listLaneMileageReference (ROUND 443.265-A — Select from reference)", () => {
  const OPCO = "5c854333-6ea5-4faa-af31-67cb272fef80";
  const lanes = [
    { id: "a", origin_city: "LAREDO", origin_state: "TX", dest_city: "MORRIS", dest_state: "IL", practical_miles: "1298.9", n_practical: 12, confidence: "High" },
    { id: "b", origin_city: "LAREDO", origin_state: "TX", dest_city: "CHICAGO", dest_state: "IL", practical_miles: "1353.7", n_practical: 123, confidence: "Thin" },
  ];
  const client = (seen: string[]) => ({
    query: async (sql: string, values?: unknown[]) => {
      seen.push(sql.replace(/\s+/g, " "));
      if (sql.includes("count(*)")) return { rows: [{ n: "3452" }] };
      expect(values).toEqual([OPCO, "Laredo", "TX", "IL"]);
      return { rows: lanes };
    },
  });

  it("lists lanes on file from the origin into the destination state, most trips first, practical only", async () => {
    const seen: string[] = [];
    const out = await listLaneMileageReference(client(seen) as never, OPCO, { origin_city: "Laredo", origin_state: "TX", dest_state: "IL" });
    expect(out.lanes_on_file).toBe(3452);
    expect(out.lanes.map((l) => [l.dest_city, l.practical_miles, l.runs])).toEqual([
      ["CHICAGO", 1353.7, 123],
      ["MORRIS", 1298.9, 12],
    ]);
    expect(out.lanes[0]).not.toHaveProperty("short_miles");
    expect(seen[1]).toContain("operating_company_id = $1::uuid");
    expect(seen[1]).toContain("lower(dest_state) = lower($4)");
  });

  it("does not query lanes without an origin and a destination state", async () => {
    const seen: string[] = [];
    const out = await listLaneMileageReference(client(seen) as never, OPCO, { origin_city: "", origin_state: "TX", dest_state: "IL" });
    expect(out).toEqual({ lanes_on_file: 3452, lanes: [] });
    expect(seen).toHaveLength(1);
  });
});
