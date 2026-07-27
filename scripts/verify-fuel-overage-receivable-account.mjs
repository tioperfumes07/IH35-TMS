#!/usr/bin/env node
/**
 * FUEL-04 — Driver Fuel-Overage Receivable exists + is_postable (not Cash Advance).
 *
 * Modes: default static · --selftest · --live (DATABASE_URL + lucia)
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIGRATION = "db/migrations/202609090000_fuel_04_driver_fuel_overage_receivable.sql";

export function assertMigrationPresent(root = ROOT) {
  const problems = [];
  const mig = path.join(root, MIGRATION);
  if (!fs.existsSync(mig)) return [`missing ${MIGRATION}`];
  const src = fs.readFileSync(mig, "utf8");
  for (const needle of [
    "Driver Fuel-Overage Receivable",
    "1250",
    "driver_fuel_overage_receivable",
    "fuel_overage_receivable",
    "OtherCurrentAsset",
    "advance_recovery",
  ]) {
    if (!src.includes(needle)) problems.push(`migration missing: ${needle}`);
  }
  if (!/NEVER touch advance_recovery|never touch advance_recovery/i.test(src)) {
    problems.push("migration must refuse to mutate advance_recovery");
  }
  return problems;
}

export function findLiveProblems(rows) {
  const problems = [];
  const byCo = new Map();
  for (const r of rows) {
    const key = r.code ?? r.operating_company_id;
    byCo.set(key, r);
  }
  for (const code of ["TRANSP", "TRK", "USMCA"]) {
    const r = byCo.get(code);
    if (!r) {
      problems.push(`${code}: missing Driver Fuel-Overage Receivable account`);
      continue;
    }
    if (String(r.account_type).toLowerCase() !== "asset") {
      problems.push(`${code}: account_type=${r.account_type} — must be Asset`);
    }
    if (!r.is_postable) problems.push(`${code}: is_postable must be true`);
    if (r.system_purpose !== "driver_fuel_overage_receivable") {
      problems.push(`${code}: system_purpose must be driver_fuel_overage_receivable`);
    }
    if (String(r.account_name).includes("Cash Advance")) {
      problems.push(`${code}: must NOT be Cash Advance (A3c)`);
    }
    if (!r.role_bound) {
      problems.push(`${code}: fuel_overage_receivable role not actively bound`);
    }
  }
  return problems;
}

function selftest() {
  const staticProblems = assertMigrationPresent();
  if (staticProblems.length) throw new Error(`static: ${staticProblems.join("; ")}`);
  const bad = findLiveProblems([
    {
      code: "TRANSP",
      account_type: "Asset",
      is_postable: true,
      system_purpose: "advance_recovery",
      account_name: "Driver Cash Advance",
      role_bound: true,
    },
  ]);
  if (!bad.length) throw new Error("selftest: Cash Advance collision under-caught");
  console.log("[verify-fuel-overage-receivable-account] SELFTEST PASS");
}

async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL required for --live");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    const { rows } = await client.query(`
      SELECT c.code,
             a.account_number,
             a.account_name,
             a.account_type,
             a.system_purpose,
             a.is_postable,
             EXISTS (
               SELECT 1 FROM accounting.chart_of_accounts_roles r
                WHERE r.operating_company_id = c.id
                  AND r.role = 'fuel_overage_receivable'
                  AND r.is_active
                  AND r.account_id = a.id
             ) AS role_bound
        FROM org.companies c
        LEFT JOIN catalogs.accounts a
          ON a.operating_company_id = c.id
         AND a.deactivated_at IS NULL
         AND a.system_purpose = 'driver_fuel_overage_receivable'
       WHERE c.code IN ('TRANSP','TRK','USMCA')
       ORDER BY c.code
    `);
    const problems = findLiveProblems(rows);
    if (problems.length) {
      console.error("[verify-fuel-overage-receivable-account] LIVE FAIL:");
      for (const p of problems) console.error(`  - ${p}`);
      process.exit(1);
    }
    console.log(
      `[verify-fuel-overage-receivable-account] LIVE PASS — ${rows.length} entities have postable overage receivable + role bind`,
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
    console.error("[verify-fuel-overage-receivable-account] FAIL:");
    for (const p of staticProblems) console.error(`  - ${p}`);
    process.exit(1);
  }
  if (argv.includes("--live")) {
    await liveCheck();
    return;
  }
  console.log(
    "[verify-fuel-overage-receivable-account] PASS — migration present; run --live with DATABASE_URL for prod proof",
  );
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main().catch((err) => {
    console.error(`[verify-fuel-overage-receivable-account] ${err instanceof Error ? err.message : err}`);
    process.exit(1);
  });
}
