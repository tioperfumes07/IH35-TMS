#!/usr/bin/env node
/**
 * GUARD — BANK-F06: the Banking Home money KPIs must not be sourced from views.banking_account_tiles,
 * and the account-visibility write must only touch columns that exist.
 *
 * THE DEFECT (verified on prod 2026-08-04). views.banking_account_tiles is a dead stub — its
 * definition is `SELECT NULL::uuid AS id, ... 0::numeric AS current_balance ... WHERE false`, so it can
 * never return a row. The KPI endpoint aggregated it, so kpiRes.rows[0] was always undefined and the
 * fallback supplied 0 for total_dip_cash, dip_operating, dip_payroll, factoring_reserve and
 * driver_escrow. Banking Home reported $0 DIP cash against real balances — silently, with no error and
 * no empty state. DIP cash is Chapter 11 reporting-relevant.
 *
 * The cause was one layer down: POST /banking/accounts/visibility writes visible/tag/is_dip to
 * banking.bank_accounts, and NONE of those columns existed (only display_order did), so the statement
 * threw on every call and no account could ever be classified. Migration 202612020000 adds them.
 *
 * WHAT IT ENFORCES:
 *   A. the KPI handler does not read views.banking_account_tiles — a money figure may not come from a
 *      view that cannot return rows;
 *   B. the KPI aggregates banking.bank_accounts, the same authoritative table as the cash total, so the
 *      buckets cannot disagree with the total they sit under;
 *   C. every column the visibility UPDATE writes is one the migration creates (or already existed).
 *
 * (C) is what stops the pair of defects recurring together: adding a write for a column nobody created
 * is exactly how the KPI ended up with nothing to report.
 */
import { readFileSync, existsSync, readdirSync } from "node:fs";

const LABEL = "verify:banking-kpi-not-dead-view";
const ROUTES = "apps/backend/src/banking/banking.routes.ts";
const MIGRATIONS = "db/migrations";
const DEAD_VIEW = "views.banking_account_tiles";
/** Columns that already existed on banking.bank_accounts before BANK-F06. */
const PRE_EXISTING = new Set(["display_order", "is_active", "deactivated_at", "hidden_at", "ledger_account_id", "display_name", "account_class"]);

/**
 * Strip comments before any content assertion. The fix's own explanatory comment names the dead view
 * ("read the AUTHORITATIVE table, not views.banking_account_tiles"), and an earlier version of this
 * guard matched that comment and failed against the correct file. Fourth occurrence of this class in
 * one session: assertions read operative code, never comments, messages, or fixtures.
 */
export function stripComments(src) {
  return String(src).replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

export function extractKpiHandler(src) {
  const i = String(src).indexOf('app.get("/api/v1/banking/dashboard/kpis"');
  if (i < 0) return null;
  const rest = String(src).slice(i + 10);
  const ends = [rest.indexOf("app.get("), rest.indexOf("app.post(")].filter((n) => n > 0);
  return String(src).slice(i, ends.length ? i + 10 + Math.min(...ends) : String(src).length);
}

export function extractVisibilityUpdateColumns(src) {
  const m = /UPDATE\s+banking\.bank_accounts\s+SET([\s\S]{0,400}?)WHERE/i.exec(String(src));
  if (!m) return [];
  return [...m[1].matchAll(/(^|[\s,])([a-z_]+)\s*=/g)].map((x) => x[2]);
}

export function analyse(files, migrationColumns) {
  const problems = [];
  const src = files[ROUTES];
  if (src == null) {
    problems.push(`${ROUTES} is missing — cannot verify the KPI source.`);
    return problems;
  }

  const kpi = extractKpiHandler(stripComments(src));
  if (kpi == null) {
    problems.push(`${ROUTES}: the /banking/dashboard/kpis handler was not found — repoint this guard rather than leaving it unable to check.`);
  } else {
    if (kpi.includes(DEAD_VIEW)) {
      problems.push(
        `${ROUTES}: the KPI handler reads ${DEAD_VIEW}, which is a stub defined as "... WHERE false" and can ` +
          `NEVER return a row. Aggregating it makes total_dip_cash / dip_operating / dip_payroll / ` +
          `factoring_reserve / driver_escrow report $0 silently against real balances.`
      );
    }
    if (!/FROM\s+banking\.bank_accounts/i.test(kpi)) {
      problems.push(
        `${ROUTES}: the KPI handler no longer aggregates banking.bank_accounts. The money buckets must ` +
          `come from the same authoritative table as the cash total, or the parts can disagree with it.`
      );
    }
  }

  for (const col of extractVisibilityUpdateColumns(stripComments(src))) {
    if (PRE_EXISTING.has(col) || migrationColumns.has(col)) continue;
    problems.push(
      `${ROUTES}: the account-visibility UPDATE writes banking.bank_accounts.${col}, which no migration ` +
        `creates. That statement throws "column does not exist" at runtime — the exact defect that left ` +
        `every account unclassifiable and the DIP KPI permanently empty.`
    );
  }
  return problems;
}

function migrationColumnsOnDisk() {
  const cols = new Set();
  if (!existsSync(MIGRATIONS)) return cols;
  for (const f of readdirSync(MIGRATIONS)) {
    if (!f.endsWith(".sql")) continue;
    const body = readFileSync(`${MIGRATIONS}/${f}`, "utf8");
    if (!/ALTER TABLE\s+banking\.bank_accounts/i.test(body) && !/CREATE TABLE[^;]*banking\.bank_accounts/i.test(body)) continue;
    for (const m of body.matchAll(/ADD COLUMN(?:\s+IF NOT EXISTS)?\s+([a-z_]+)/gi)) cols.add(m[1]);
  }
  return cols;
}

function selftest() {
  const failures = [];
  const t = (l, c) => { if (!c) failures.push(l); };
  const mk = (body) => ({ [ROUTES]: `app.get("/api/v1/banking/dashboard/kpis", async () => {\n${body}\n});\napp.post("/x", async () => {});\n` });
  const good = mk("await client.query(`SELECT 1 FROM banking.bank_accounts b WHERE b.is_active`);");
  const dead = mk("await client.query(`SELECT * FROM views.banking_account_tiles t`);");
  const cols = new Set(["visible", "tag", "is_dip"]);

  t("KPI on the authoritative table PASSES", analyse(good, cols).length === 0);
  t("KPI reading the dead view FAILS", analyse(dead, cols).length === 2);
  t("a visibility write of a created column PASSES",
    analyse({ [ROUTES]: good[ROUTES] + "UPDATE banking.bank_accounts SET tag = $1, is_dip = $2 WHERE id = $3" }, cols).length === 0);
  t("a visibility write of an UNCREATED column FAILS",
    analyse({ [ROUTES]: good[ROUTES] + "UPDATE banking.bank_accounts SET color_tag = $1 WHERE id = $2" }, cols).length === 1);
  t("a pre-existing column is not flagged",
    analyse({ [ROUTES]: good[ROUTES] + "UPDATE banking.bank_accounts SET display_order = $1 WHERE id = $2" }, cols).length === 0);
  t("a moved KPI handler FAILS rather than passing vacuously", analyse({ [ROUTES]: "app.get('/other', async () => {});" }, cols).length >= 1);
  t("a missing routes file FAILS", analyse({ [ROUTES]: null }, cols).length === 1);

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  console.log(`${LABEL} selftest OK — 7 cases (2 pass-shapes, 5 fail-shapes incl. the dead-view read and an uncreated write column)`);
  process.exit(0);
}

const files = { [ROUTES]: existsSync(ROUTES) ? readFileSync(ROUTES, "utf8") : null };
const problems = analyse(files, migrationColumnsOnDisk());
if (problems.length) {
  console.error(`${LABEL} FAILED:\n  - ${problems.join("\n  - ")}`);
  process.exit(1);
}
console.log(`${LABEL} OK — KPI reads banking.bank_accounts, not the dead tiles view; visibility writes only created columns`);
