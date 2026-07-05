import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

// D1-4 static guard: the sub-customer -> parent hard link (parent_customer_id) must stay idempotent in
// the migration AND stay wired end-to-end in the customer routes (persist on create + update, validate,
// and expose the reverse drill-through). These assertions fail fast if a future change silently drops
// any leg of the link.
const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../..");
const migrationPath = path.join(repoRoot, "db/migrations/202607050820_mdata_customers_parent_customer_id.sql");
const routesPath = path.join(repoRoot, "apps/backend/src/mdata/customers.routes.ts");

describe("202607050820 mdata.customers.parent_customer_id migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("adds a nullable, idempotent, self-referential parent FK column", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS parent_customer_id uuid/);
    expect(sql).toMatch(/customers_parent_customer_id_fkey/);
    expect(sql).toMatch(/REFERENCES mdata\.customers \(id\)/);
    expect(sql).toMatch(/BEGIN;/);
    expect(sql).toMatch(/COMMIT;/);
  });

  it("guards against a self-parent at the DB level and indexes the reverse lookup", () => {
    expect(sql).toMatch(/customers_parent_not_self_chk/);
    expect(sql).toMatch(/parent_customer_id <> id/);
    expect(sql).toMatch(/CREATE INDEX IF NOT EXISTS idx_customers_parent_customer_id/);
  });

  it("does NOT touch RLS / security_invoker (additive column only)", () => {
    expect(sql).not.toMatch(/ENABLE ROW LEVEL SECURITY/i);
    expect(sql).not.toMatch(/CREATE POLICY/i);
    // security_invoker may appear in a comment explaining it is unchanged; only a real SET matters.
    expect(sql).not.toMatch(/SET \(\s*security_invoker/i);
  });
});

describe("customers.routes wires parent_customer_id end-to-end (D1-4)", () => {
  const routes = fs.readFileSync(routesPath, "utf8");

  it("accepts parent_customer_id on create + update and selects it back", () => {
    expect(routes).toMatch(/parent_customer_id: z\.string\(\)\.uuid\(\)\.nullable\(\)\.optional\(\)/);
    expect(routes).toMatch(/parent_customer_id,/); // in CUSTOMER_SELECT_COLUMNS
  });

  it("persists the link on create and update", () => {
    expect(routes).toMatch(/addOptional\("parent_customer_id", b\.parent_customer_id\)/);
    expect(routes).toMatch(/if \("parent_customer_id" in b\) add\("parent_customer_id"/);
  });

  it("validates the parent (self / cycle / cross-company / parent-is-sub guards)", () => {
    expect(routes).toMatch(/validateParentCustomer/);
    expect(routes).toMatch(/"parent_is_sub"/);
    expect(routes).toMatch(/"has_children"/);
  });

  it("exposes the reverse drill-through (sub_customers) + parent name in the detail endpoint", () => {
    expect(routes).toMatch(/AS parent_customer_name/);
    expect(routes).toMatch(/AS sub_customers/);
    expect(routes).toMatch(/WHERE s\.parent_customer_id = c\.id/);
  });
});
