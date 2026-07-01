import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(repoRoot, "db/migrations/202607011700_detail_types_per_entity_custom.sql");

describe("202607011700_detail_types_per_entity_custom migration", () => {
  const sql = fs.readFileSync(migrationPath, "utf8");

  it("EXTENDS the existing detail_types table (does not create a duplicate account_detail_types table)", () => {
    expect(sql).toMatch(/ALTER TABLE catalogs\.detail_types/);
    expect(sql).not.toMatch(/CREATE TABLE[^;]*account_detail_types/i);
  });

  it("adds per-entity + is_system columns", () => {
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS operating_company_id uuid/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS code text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS description text/);
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS is_system boolean NOT NULL DEFAULT false/);
  });

  it("seals the pre-existing seeded rows as immutable system rows", () => {
    expect(sql).toMatch(/UPDATE catalogs\.detail_types\s+SET is_system = true\s+WHERE operating_company_id IS NULL/);
  });

  it("enforces entity isolation on custom codes (partial unique index)", () => {
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS uq_detail_types_entity_code/);
    expect(sql).toMatch(/WHERE operating_company_id IS NOT NULL AND code IS NOT NULL/);
  });

  it("enables + forces RLS with system-visible-to-all read and non-system entity write policies", () => {
    expect(sql).toMatch(/ENABLE ROW LEVEL SECURITY/);
    expect(sql).toMatch(/FORCE ROW LEVEL SECURITY/);
    // system rows (opco NULL) readable by everyone
    expect(sql).toMatch(/operating_company_id IS NULL OR operating_company_id::text = current_setting\('app\.operating_company_id', true\)/);
    // writes restricted to caller's own NON-system rows
    expect(sql).toMatch(/is_system = false/);
  });

  it("grants CRUD to ih35_app", () => {
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE, DELETE ON catalogs\.detail_types TO ih35_app/);
  });
});
