import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// Regression guard — the QBO-sync writers into the per-entity catalogs.items / catalogs.accounts
// (AF-1/AF-2) MUST carry operating_company_id and conflict on the composite arbiter. Before this fix
// the pullers INSERTed without operating_company_id and ON CONFLICT (qbo_*_id) — which post-AF-1/AF-2
// both 500s (NOT NULL + missing arbiter) AND cross-entity clobbers. This keeps them honest.

function read(rel: string): string {
  return readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");
}

describe("qbo-sync writers into per-entity catalogs are entity-scoped", () => {
  it("items-puller writes operating_company_id + composite conflict", () => {
    // ACCT-F83 — the puller's upsert SQL now lives in items-write-sql.ts (one reviewed home for every
    // QBO-sourced catalogs.items write). The invariant is about the SQL, not about which file holds
    // it, so read both.
    //
    // The anchor is asserted BEFORE slicing. The previous form was
    // `src.slice(src.indexOf("INSERT INTO catalogs.items"))`, and when the SQL moved indexOf returned
    // -1, so slice(-1) yielded the single trailing "\n" — every `toContain` then failed with the
    // baffling 'expected "\n" to contain …'. It failed closed here only because these assertions are
    // positive; a `not.toMatch` against "\n" would have passed vacuously forever.
    const src = read("./items-puller.ts") + "\n" + read("./items-write-sql.ts");
    const at = src.indexOf("INSERT INTO catalogs.items");
    expect(at, "no INSERT INTO catalogs.items found in the puller or its SQL module").toBeGreaterThanOrEqual(0);
    const insert = src.slice(at);
    expect(insert).toContain("operating_company_id");
    expect(insert).toMatch(/ON CONFLICT \(operating_company_id, qbo_item_id\)/);
    expect(insert).not.toMatch(/ON CONFLICT \(qbo_item_id\)/);
  });

  it("chart-of-accounts-puller writes operating_company_id + composite conflict", () => {
    const src = read("./chart-of-accounts-puller.ts");
    const insert = src.slice(src.indexOf("INSERT INTO catalogs.accounts"));
    expect(insert).toContain("operating_company_id");
    expect(insert).toMatch(/ON CONFLICT \(operating_company_id, qbo_account_id\)/);
    expect(insert).not.toMatch(/ON CONFLICT \(qbo_account_id\)/);
  });

  it("items-reconciler scopes every catalogs.items read/write/dedup by operating_company_id", () => {
    // ACCT-F83 — the reconciler's constraint-bearing SQL moved to items-write-sql.ts; the scoping
    // invariant follows it. Both files are read so the entity-scope assertions cannot be satisfied by
    // whichever half happens to still hold the statement.
    const reconciler = read("./items-reconciler.ts");
    const sql = read("./items-write-sql.ts");
    const src = `${reconciler}\n${sql}`;
    // mark-drift + count + status + heal + create + conflict-count must all filter the entity.
    expect((src.match(/operating_company_id = \$1::uuid/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // create-from-mirror + heal dedup WITHIN the entity, never across entities.
    expect(src).toMatch(/ci\.operating_company_id = qi\.operating_company_id/);
    // the status API param is used, not ignored
    expect(reconciler).not.toContain("_operatingCompanyId");
    // ACCT-F83 — the name/code free-tests added for the collision fix introduced two NEW correlated
    // subqueries (`other`, `peer`). Both run under lucia-bypass with RLS off, so an unscoped probe
    // would read ACROSS entities and either suppress a legitimate insert or decline a legitimate
    // rename based on another company's catalogue. Assert each is entity-scoped at its own alias.
    expect(sql).toMatch(/other\.operating_company_id = qi\.operating_company_id/);
    expect(sql).toMatch(/peer\.operating_company_id = qi\.operating_company_id/);
  });
});
