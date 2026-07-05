import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";
import { describe, it, expect } from "vitest";

// REPORTS-1 static guard: the Reports-module A/R and A/P aging routes (the ones the Reports UI calls)
// must stay wired to the CANONICAL aging objects — the same views.ar_aging / views.ap_aging and the
// accounting.*_aging_as_of point-in-time functions the Finance Hub FIN-20 screen and the statement
// exports use — and must NOT re-grow their own inline bucket math (which had collapsed the "current"
// not-yet-due balance into the first bucket and computed wrong historical balances for past dates).
const here = dirname(fileURLToPath(import.meta.url));
const arRoutes = readFileSync(resolve(here, "ar-aging.routes.ts"), "utf8");
const apRoutes = readFileSync(resolve(here, "ap-aging.routes.ts"), "utf8");

// Strip comments + string literals so a comment describing the OLD behavior can't trip the scans.
function stripCommentsAndStrings(src: string): string {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`[\s\S]*?`/g, (m) => m.replace(/--[^\n]*/g, " "))
    .replace(/"(?:[^"\\]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\]|\\.)*'/g, "''");
}

const WRITE_SQL =
  /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM|MERGE\s+INTO|TRUNCATE|DROP\s+|ALTER\s+|CREATE\s+(?:TABLE|VIEW|INDEX)|GRANT\s+|REVOKE\s+)\b/i;

describe("REPORTS-1 aging routes source from the canonical aging objects", () => {
  it("A/R aging reads the canonical view (live) and as-of function (historical)", () => {
    expect(arRoutes).toContain("FROM views.ar_aging");
    expect(arRoutes).toContain("accounting.ar_aging_as_of($1::uuid, $2::date)");
  });

  it("A/P aging reads the canonical view (live) and as-of function (historical)", () => {
    expect(apRoutes).toContain("FROM views.ap_aging");
    expect(apRoutes).toContain("accounting.ap_aging_as_of($1::uuid, $2::date)");
  });

  it("neither route re-invents inline bucket math (no per-bucket FILTER in the route SQL)", () => {
    // The canonical view/function already return the 5 buckets as plain columns; a FILTER(WHERE ...)
    // in these routes would mean the old duplicated aging math crept back in.
    expect(/FILTER\s*\(\s*WHERE/i.test(stripCommentsAndStrings(arRoutes))).toBe(false);
    expect(/FILTER\s*\(\s*WHERE/i.test(stripCommentsAndStrings(apRoutes))).toBe(false);
  });

  it("exposes the true current split (canonical) plus the back-compat 0-30 bucket", () => {
    for (const src of [arRoutes, apRoutes]) {
      expect(src).toContain("current_cents");
      expect(src).toContain("bucket_1_30_cents");
      expect(src).toContain("bucket_0_30_cents");
    }
  });

  it("stays opco-scoped on the live read (no cross-entity bleed)", () => {
    expect(arRoutes).toContain("operating_company_id = $1::uuid");
    expect(apRoutes).toContain("operating_company_id = $1::uuid");
  });

  it("stays read-only (no write SQL)", () => {
    expect(WRITE_SQL.test(stripCommentsAndStrings(arRoutes))).toBe(false);
    expect(WRITE_SQL.test(stripCommentsAndStrings(apRoutes))).toBe(false);
  });
});

describe("REPORTS-1 Reports UI consumes the canonical current split", () => {
  const reportsApi = readFileSync(resolve(here, "../../../frontend/src/api/reports.ts"), "utf8");

  it("no longer hardcodes current_cents to 0 in the aging mappers", () => {
    expect(reportsApi).not.toContain("current_cents: 0,");
  });

  it("reads current_cents / bucket_1_30_cents from the canonical payload", () => {
    expect(reportsApi).toContain("current_cents: r.current_cents ?? 0");
    expect(reportsApi).toContain("bucket_1_30_cents: r.bucket_1_30_cents ?? r.bucket_0_30_cents");
  });
});
