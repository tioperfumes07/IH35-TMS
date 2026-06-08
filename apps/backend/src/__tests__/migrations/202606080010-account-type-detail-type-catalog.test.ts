import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/202606080010_account_type_detail_type_catalog.sql",
);

describe("202606080010_account_type_detail_type_catalog migration", () => {
  let sql: string;
  it("migration file exists", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql.length).toBeGreaterThan(0);
  });

  it("creates catalogs.account_types table", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS catalogs\.account_types/);
    expect(sql).toMatch(/statement.*CHECK.*IN.*'BS'.*'P&L'/);
    expect(sql).toMatch(/normal_balance.*CHECK.*IN.*'Debit'.*'Credit'/);
    expect(sql).toMatch(/default_action.*CHECK.*IN.*'view_register'.*'run_report'/);
  });

  it("creates catalogs.detail_types table with FK to account_types", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS catalogs\.detail_types/);
    expect(sql).toMatch(/REFERENCES catalogs\.account_types\(id\)/);
    expect(sql).toMatch(/UNIQUE \(account_type_id, name\)/);
  });

  it("grants SELECT, INSERT, UPDATE on both tables to ih35_app", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON catalogs\.account_types TO ih35_app/);
    expect(sql).toMatch(/GRANT SELECT, INSERT, UPDATE ON catalogs\.detail_types\s+TO ih35_app/);
    expect(sql).toMatch(/GRANT USAGE ON SCHEMA catalogs TO ih35_app/);
  });

  it("seeds exactly 15 account type codes", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    // Each account type row starts with  ('CODE',
    const codeMatches = sql.match(/^\s*\('(BANK|AR|OCA|FA|OA|CC|AP|OCL|LTL|EQ|INC|OINC|COGS|EXP|OEXP)',/gm);
    expect(codeMatches).not.toBeNull();
    expect(new Set(codeMatches!.map((m) => m.trim().match(/'\w+'/)?.[0]))).toHaveProperty("size", 15);
  });

  it("seeds account types across exactly 5 groups", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const groups = ["ASSET", "LIABILITY", "EQUITY", "INCOME", "EXPENSE"];
    for (const g of groups) {
      expect(sql).toMatch(new RegExp(`'${g}'`));
    }
  });

  it("seeds Bank detail types exactly matching QBO spec", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const bankDetailTypes = [
      "Cash on hand",
      "Checking",
      "Money Market",
      "Rents Held in Trust",
      "Savings",
      "Trust account",
    ];
    for (const dt of bankDetailTypes) {
      expect(sql).toContain(dt);
    }
  });

  it("seed uses ON CONFLICT DO NOTHING (idempotent)", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/ON CONFLICT.*DO NOTHING/);
  });

  it("is wrapped in BEGIN / COMMIT", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/^\s*BEGIN\s*;/m);
    expect(sql).toMatch(/^\s*COMMIT\s*;/m);
  });
});
