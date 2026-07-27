#!/usr/bin/env node
/**
 * SET-02 — driver_payroll_clearing must be a distinct LIABILITY, never the Cash Advance asset.
 *
 * Modes:
 *   (default) static source + fixture selftest
 *   --live   connect DATABASE_URL and prove prod bindings (lucia bypass)
 *
 * FAIL if any active accounting.chart_of_accounts_roles row for driver_payroll_clearing:
 *   - points at a non-Liability account, OR
 *   - shares account_id with advance_recovery for the same operating_company_id.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202609200000_set_02_driver_netpay_clearing_liability.sql";

export function assertMigrationPresent(root = ROOT) {
  const problems = [];
  const mig = path.join(root, MIGRATION);
  if (!fs.existsSync(mig)) {
    problems.push(`missing ${MIGRATION}`);
    return problems;
  }
  const src = fs.readFileSync(mig, "utf8");
  for (const needle of [
    "Driver Net-Pay Clearing",
    "2170",
    "driver_payroll_clearing",
    "OtherCurrentLiability",
    "advance_recovery", // must appear only in "do not touch" prose — still required as a reminder
  ]) {
    if (!src.includes(needle)) problems.push(`migration missing required token: ${needle}`);
  }
  if (!/NEVER touch advance_recovery|do NOT touch advance_recovery|NEVER touch advance/i.test(src)) {
    problems.push("migration must explicitly refuse to mutate advance_recovery");
  }
  return problems;
}

/** Pure check used by --selftest and --live. */
export function findBindingProblems(rows) {
  const problems = [];
  const byCo = new Map();
  for (const row of rows) {
    const key = row.operating_company_id ?? row.co;
    if (!byCo.has(key)) byCo.set(key, {});
    byCo.get(key)[row.role] = row;
  }
  for (const [co, roles] of byCo) {
    const clearing = roles.driver_payroll_clearing;
    const advance = roles.advance_recovery;
    if (!clearing) {
      problems.push(`${co}: missing active driver_payroll_clearing binding`);
      continue;
    }
    const type = String(clearing.account_type ?? "").toLowerCase();
    if (type !== "liability") {
      problems.push(
        `${co}: driver_payroll_clearing → ${clearing.account_name ?? "?"} (${clearing.account_type}) — must be Liability`,
      );
    }
    if (advance && clearing.account_id && advance.account_id && clearing.account_id === advance.account_id) {
      problems.push(
        `${co}: driver_payroll_clearing shares account_id with advance_recovery (${clearing.account_name}) — SET-02 collision`,
      );
    }
    if (String(clearing.qbo_account_id ?? "") === "149") {
      problems.push(`${co}: driver_payroll_clearing still on QBO-149 Cash Advance`);
    }
  }
  return problems;
}

function selftest() {
  const staticProblems = assertMigrationPresent();
  if (staticProblems.length) throw new Error(`static: ${staticProblems.join("; ")}`);

  const ok = findBindingProblems([
    {
      operating_company_id: "t",
      role: "driver_payroll_clearing",
      account_id: "a1",
      account_type: "Liability",
      account_name: "Driver Net-Pay Clearing",
      qbo_account_id: null,
    },
    {
      operating_company_id: "t",
      role: "advance_recovery",
      account_id: "a2",
      account_type: "Asset",
      account_name: "Driver Cash Advance",
      qbo_account_id: "149",
    },
  ]);
  if (ok.length) throw new Error(`selftest false positive: ${ok.join("; ")}`);

  const badType = findBindingProblems([
    {
      operating_company_id: "t",
      role: "driver_payroll_clearing",
      account_id: "a2",
      account_type: "Asset",
      account_name: "Driver Cash Advance",
      qbo_account_id: "149",
    },
    {
      operating_company_id: "t",
      role: "advance_recovery",
      account_id: "a2",
      account_type: "Asset",
      account_name: "Driver Cash Advance",
      qbo_account_id: "149",
    },
  ]);
  if (!badType.some((p) => p.includes("must be Liability"))) {
    throw new Error("selftest: non-Liability clearing not detected");
  }
  if (!badType.some((p) => p.includes("shares account_id"))) {
    throw new Error("selftest: shared account_id not detected");
  }
  console.log("[verify-netpay-clearing-is-liability] --selftest PASS");
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("--live requires DATABASE_URL");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const { rows } = await client.query(`
      SELECT o.code AS co,
             o.id::text AS operating_company_id,
             r.role,
             r.account_id::text AS account_id,
             a.account_number,
             a.account_name,
             a.account_type,
             a.qbo_account_id
      FROM accounting.chart_of_accounts_roles r
      JOIN catalogs.accounts a ON a.id = r.account_id
      JOIN org.companies o ON o.id = r.operating_company_id
      WHERE r.is_active
        AND r.role IN ('driver_payroll_clearing', 'advance_recovery')
        AND o.code IN ('TRANSP', 'TRK', 'USMCA')
      ORDER BY o.code, r.role
    `);
    const problems = findBindingProblems(rows);
    // Also require 2170 exists for each entity that has an active clearing binding.
    for (const row of rows.filter((r) => r.role === "driver_payroll_clearing")) {
      if (row.account_number !== "2170" || row.account_name !== "Driver Net-Pay Clearing") {
        problems.push(
          `${row.co}: clearing bound to ${row.account_number} ${row.account_name} — expected 2170 Driver Net-Pay Clearing`,
        );
      }
    }
    if (problems.length) {
      console.error("[verify-netpay-clearing-is-liability] LIVE FAIL:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(
      `[verify-netpay-clearing-is-liability] LIVE PASS — ${rows.filter((r) => r.role === "driver_payroll_clearing").length} entities bound to Liability 2170`,
    );
  } finally {
    await client.end();
  }
}

async function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--selftest")) {
    selftest();
    return;
  }
  const staticProblems = assertMigrationPresent();
  if (staticProblems.length) {
    console.error("[verify-netpay-clearing-is-liability] FAIL:");
    for (const p of staticProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes("--live")) {
    await liveCheck();
    return;
  }
  console.log("[verify-netpay-clearing-is-liability] PASS — migration present; run --live with DATABASE_URL for prod proof");
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(`[verify-netpay-clearing-is-liability] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
