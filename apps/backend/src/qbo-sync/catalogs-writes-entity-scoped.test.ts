import { describe, expect, it } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression guard — QBO-sync writers into the per-entity catalogs.items / catalogs.accounts.
//
// ACCT-F4431380 (Lead 443.137 item 9e; owner ruling — QuickBooks is a READ-ONLY ARCHIVE).
//   OLD: asserted every QBO-sync INSERT INTO catalogs.items / catalogs.accounts carried operating_company_id
//        and conflicted on the composite (operating_company_id, qbo_*_id) arbiter (AF-1/AF-2), and that the
//        items reconciler's SQL module (items-write-sql.ts) scoped every probe by entity.
//   NEW: there is no QBO-sync write into either catalog any more, so the strongest form of "entity-scoped"
//        is "absent": the pullers write only their mirror, the reconcilers refuse by name, and the SQL
//        module is deleted. A re-introduced catalog write fails here (and in
//        scripts/verify-qbo-paths-never-write-native-tables.mjs).

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

const CATALOG_WRITE_RE = /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+catalogs\.(?:items|accounts)\b/i;

describe("qbo-sync never writes the per-entity native catalogs", () => {
  it("items-puller writes only mdata.qbo_items (no catalogs.items write)", () => {
    const src = read("./items-puller.ts");
    expect(src).toMatch(/INSERT INTO mdata\.qbo_items/);
    expect(src).not.toMatch(CATALOG_WRITE_RE);
  });

  it("chart-of-accounts-puller writes only mdata.qbo_accounts (no catalogs.accounts write)", () => {
    const src = read("./chart-of-accounts-puller.ts");
    expect(src).toMatch(/INSERT INTO mdata\.qbo_accounts/);
    expect(src).not.toMatch(CATALOG_WRITE_RE);
  });

  it("items/coa reconcilers refuse by name and the items-write-sql module is gone", () => {
    for (const f of ["./items-reconciler.ts", "./chart-of-accounts-reconciler.ts"]) {
      const src = read(f);
      expect(src, f).toMatch(/refuseQboNativeWrite\(/);
      expect(src, f).not.toMatch(CATALOG_WRITE_RE);
    }
    expect(existsSync(fileURLToPath(new URL("./items-write-sql.ts", import.meta.url)))).toBe(false);
  });
});
