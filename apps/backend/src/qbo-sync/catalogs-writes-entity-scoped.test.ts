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
    const src = read("./items-puller.ts");
    const insert = src.slice(src.indexOf("INSERT INTO catalogs.items"));
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
    const src = read("./items-reconciler.ts");
    // mark-drift + count + status must filter operating_company_id
    expect((src.match(/operating_company_id = \$1::uuid/g) ?? []).length).toBeGreaterThanOrEqual(4);
    // create-from-mirror inserts operating_company_id and dedups within the entity
    expect(src).toMatch(/ci\.operating_company_id = qi\.operating_company_id/);
    // the status API param is used, not ignored
    expect(src).not.toContain("_operatingCompanyId");
  });
});
