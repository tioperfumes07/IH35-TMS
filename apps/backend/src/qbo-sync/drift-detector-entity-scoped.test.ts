import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression guard (C2-1) — the COA drift-detector reads catalogs.accounts, which is a per-entity
// posting ledger (AF-1 split every account per operating_company_id, composite unique on
// (operating_company_id, qbo_account_id)). Before this fix detectCoaDrift scanned catalogs.accounts
// with NO operating_company_id predicate, so it blended TRANSP/TRK/USMCA accounts (cross-entity leak,
// a USMCA-launch blocker): a same-qbo_account_id copy in another entity could hide a true missing_local
// drift, and the missing_qbo / field_mismatch scans reported foreign-entity rows. RLS on catalogs.* is
// role- not entity-scoped, so set_config alone does NOT scope the read — every catalogs.accounts read
// in the CoA detector must carry an explicit operating_company_id predicate. This keeps it honest.

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

function detectCoaDriftBody(src: string): string {
  const start = src.indexOf("async function detectCoaDrift");
  expect(start).toBeGreaterThanOrEqual(0);
  const next = src.indexOf("async function detectItemsDrift", start);
  expect(next).toBeGreaterThan(start);
  return src.slice(start, next);
}

describe("qbo-sync COA drift-detector is entity-scoped (C2-1)", () => {
  const src = read("./drift-detector.ts");
  const body = detectCoaDriftBody(src);

  it("scans catalogs.accounts only within one operating_company_id", () => {
    // Every catalogs.accounts read in the CoA detector must be entity-scoped.
    expect(body).toContain("catalogs.accounts");
    expect(body).toMatch(/operating_company_id\s*=\s*\$1::uuid/);
  });

  it("missing_qbo scan carries an operating_company_id predicate (not a blended scan)", () => {
    // The primary FROM catalogs.accounts scan (missing_qbo) must filter by entity, never rely on RLS.
    const bareUnfiltered = /FROM catalogs\.accounts\s+WHERE deactivated_at IS NULL\s+AND qbo_account_id IS NULL/;
    expect(body).not.toMatch(bareUnfiltered);
    expect(body).toMatch(
      /FROM catalogs\.accounts\s+WHERE operating_company_id = \$1::uuid[\s\S]*?qbo_account_id IS NULL/
    );
  });

  it("missing_local NOT EXISTS subquery scopes catalogs.accounts to the same entity", () => {
    // The correlated existence check must not match a same-qbo_account_id copy owned by another entity.
    const bareNotExists = /SELECT 1 FROM catalogs\.accounts ca WHERE ca\.qbo_account_id = qa\.qbo_id\s*\)/;
    expect(body).not.toMatch(bareNotExists);
    expect(body).toMatch(/ca\.operating_company_id\s*=\s*qa\.operating_company_id/);
  });

  it("field_mismatch join filters the catalogs.accounts side by operating_company_id", () => {
    expect(body).toMatch(/WHERE ca\.operating_company_id = \$1::uuid/);
  });
});
