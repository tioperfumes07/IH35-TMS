import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/202606080230_coa_account_lock_balance_as_of.sql",
);

describe("202606080230_coa_account_lock_balance_as_of migration", () => {
  let sql: string;

  it("migration file exists and is non-empty", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql.length).toBeGreaterThan(0);
  });

  it("is wrapped in BEGIN / COMMIT", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).toMatch(/^\s*COMMIT\s*;/m);
  });

  it("targets catalogs.accounts", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/catalogs\.accounts/);
  });

  it("drops NOT NULL on account_number (makes it optional)", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/ALTER COLUMN account_number DROP NOT NULL/i);
  });

  it("does NOT drop the UNIQUE constraint on account_number", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).not.toMatch(/DROP.*UNIQUE.*account_number/i);
  });

  it("adds is_locked column as boolean NOT NULL DEFAULT false", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS is_locked\s+boolean\s+NOT NULL\s+DEFAULT false/i);
  });

  it("adds opening_balance_as_of column as date (nullable)", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS opening_balance_as_of\s+date/i);
    expect(sql).not.toMatch(/opening_balance_as_of\s+date\s+NOT NULL/i);
  });

  it("grants SELECT, INSERT, UPDATE on catalogs.accounts to ih35_app", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/GRANT.*SELECT.*INSERT.*UPDATE.*ON catalogs\.accounts\s+TO ih35_app/i);
  });

  it("grants USAGE on schema catalogs to ih35_app", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA catalogs TO ih35_app/i);
  });
});

describe("CA-04 accounts.routes.ts — locked account enforcement", () => {
  let src: string;
  const routesPath = path.join(
    repoRoot,
    "apps/backend/src/catalogs/accounts.routes.ts",
  );

  it("routes file exists", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src.length).toBeGreaterThan(0);
  });

  it("PATCH endpoint reads is_locked before updating", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/is_locked.*===.*true/);
    expect(src).toMatch(/__locked/);
  });

  it("PATCH endpoint returns HTTP 423 for locked accounts", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/\.code\(423\)/);
    expect(src).toMatch(/account_is_locked/);
  });

  it("deactivate endpoint also enforces locked account guard", () => {
    src = fs.readFileSync(routesPath, "utf8");
    const deactivateSection = src.slice(src.indexOf("/deactivate"));
    expect(deactivateSection).toMatch(/is_locked.*===.*true/);
    expect(deactivateSection).toMatch(/account_is_locked/);
  });

  it("account_number is optional (nullable) in create schema", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/account_number:.*optional.*nullable|account_number:.*nullable.*optional/s);
  });

  it("opening_balance_as_of is present in SELECT and schemas", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/opening_balance_as_of/);
    const occurrences = (src.match(/opening_balance_as_of/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });

  it("is_locked is present in SELECT and schemas", () => {
    src = fs.readFileSync(routesPath, "utf8");
    expect(src).toMatch(/is_locked/);
    const occurrences = (src.match(/is_locked/g) ?? []).length;
    expect(occurrences).toBeGreaterThanOrEqual(3);
  });
});

describe("CA-04 catalog index.ts — chart-of-accounts selectMetadataSql", () => {
  let src: string;
  const indexPath = path.join(
    repoRoot,
    "apps/backend/src/catalogs/accounting/index.ts",
  );

  it("index file exists", () => {
    src = fs.readFileSync(indexPath, "utf8");
    expect(src.length).toBeGreaterThan(0);
  });

  it("exposes is_locked in selectMetadataSql", () => {
    src = fs.readFileSync(indexPath, "utf8");
    expect(src).toMatch(/'is_locked',\s*t\.is_locked/);
  });

  it("exposes opening_balance_as_of in selectMetadataSql", () => {
    src = fs.readFileSync(indexPath, "utf8");
    expect(src).toMatch(/'opening_balance_as_of',\s*t\.opening_balance_as_of/);
  });

  it("createMapper includes is_locked with default false", () => {
    src = fs.readFileSync(indexPath, "utf8");
    expect(src).toMatch(/is_locked:.*Boolean.*metadata\.is_locked/s);
  });

  it("updateMapper propagates is_locked", () => {
    src = fs.readFileSync(indexPath, "utf8");
    expect(src).toMatch(/is_locked.*undefined.*is_locked.*Boolean/s);
  });
});
