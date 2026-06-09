import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, "../../../../../");
const migrationPath = path.join(
  repoRoot,
  "db/migrations/202606080210_accounting_periods_init.sql",
);

describe("202606080210_accounting_periods_init migration", () => {
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

  // ─── Idempotency ──────────────────────────────────────────────────────────

  it("creates unique index on (operating_company_id, period_start) for idempotency", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS/);
    expect(sql).toMatch(/operating_company_id,\s*period_start/);
  });

  it("seed INSERT uses ON CONFLICT DO NOTHING (idempotent)", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/ON CONFLICT\s*\(operating_company_id,\s*period_start\)\s*DO NOTHING/);
  });

  it("running migration SQL twice would not fail: ON CONFLICT DO NOTHING present on both flag and period inserts", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const conflicts = sql.match(/ON CONFLICT[^;]+DO NOTHING/g) ?? [];
    // At minimum: flag INSERT + period INSERT
    expect(conflicts.length).toBeGreaterThanOrEqual(2);
  });

  // ─── Guard flags ──────────────────────────────────────────────────────────

  it("registers PERIODS_INIT_ENABLED flag with default_enabled = false", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("PERIODS_INIT_ENABLED");
    // Must default to false — never auto-enable
    expect(sql).toMatch(/PERIODS_INIT_ENABLED[\s\S]{0,300}false/);
  });

  it("registers OPENING_BALANCE_BOOKKEEPER_CONFIRM flag with default_enabled = false", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toContain("OPENING_BALANCE_BOOKKEEPER_CONFIRM");
    expect(sql).toMatch(/OPENING_BALANCE_BOOKKEEPER_CONFIRM[\s\S]{0,300}false/);
  });

  it("does NOT post any opening balance journal entries", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    // No INSERT into accounting.journal_entries allowed in this migration
    expect(sql).not.toMatch(/INSERT\s+INTO\s+accounting\.journal_entries/i);
  });

  it("OPENING_BALANCE_BOOKKEEPER_CONFIRM is never auto-enabled in this migration", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    // The flag must not appear in an UPDATE or INSERT that sets enabled = true
    expect(sql).not.toMatch(
      /OPENING_BALANCE_BOOKKEEPER_CONFIRM[\s\S]{0,100}default_enabled\s*=\s*true/i,
    );
    expect(sql).not.toMatch(
      /UPDATE\s+lib\.feature_flags[\s\S]{0,200}OPENING_BALANCE_BOOKKEEPER_CONFIRM/i,
    );
  });

  // ─── Period INSERT correctness ─────────────────────────────────────────────

  it("INSERT is gated by PERIODS_INIT_ENABLED check inside DO block", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    expect(sql).toMatch(/DO\s+\$\$/);
    expect(sql).toMatch(/PERIODS_INIT_ENABLED/);
    expect(sql).toMatch(/default_enabled\s*=\s*true/);
  });

  it("seeds exactly 6 monthly periods for Jan–Jun 2026", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const months = [
      "2026-01-01",
      "2026-02-01",
      "2026-03-01",
      "2026-04-01",
      "2026-05-01",
      "2026-06-01",
    ];
    for (const m of months) {
      expect(sql).toContain(m);
    }
    // Exactly 6 period_start values
    const periodStarts = sql.match(/'2026-0[1-6]-01'/g) ?? [];
    expect(periodStarts.length).toBe(6);
  });

  it("all 6 periods target TRANSP operating_company_id", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const transpId = "91e0bf0a-133f-4ce8-a734-2586cfa66d96";
    const idMatches = sql.match(new RegExp(transpId, "g")) ?? [];
    // Once in the DO-block guard query + 6 value rows = 7 appearances minimum
    expect(idMatches.length).toBeGreaterThanOrEqual(7);
  });

  it("all 6 periods have status = open", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const openMatches = sql.match(/'open'/g) ?? [];
    expect(openMatches.length).toBe(6);
  });

  it("all 6 periods have fiscal_year = 2026", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const yearMatches = sql.match(/,\s*2026\s*,/g) ?? [];
    expect(yearMatches.length).toBe(6);
  });

  it("period_end dates are correct calendar month-ends", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const monthEnds = [
      "2026-01-31",
      "2026-02-28",
      "2026-03-31",
      "2026-04-30",
      "2026-05-31",
      "2026-06-30",
    ];
    for (const d of monthEnds) {
      expect(sql).toContain(d);
    }
  });

  it("period_labels match canonical format (e.g. 'Jan 2026')", () => {
    sql = fs.readFileSync(migrationPath, "utf8");
    const labels = ["Jan 2026", "Feb 2026", "Mar 2026", "Apr 2026", "May 2026", "Jun 2026"];
    for (const label of labels) {
      expect(sql).toContain(label);
    }
  });
});
