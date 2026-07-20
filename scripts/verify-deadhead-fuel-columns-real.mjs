#!/usr/bin/env node
/**
 * verify-deadhead-fuel-columns-real.mjs
 *
 * 0441-mod11-deadhead-phantom-fuel-columns — deadhead.service.ts queried
 * fuel.fuel_transactions.total_miles + .transaction_date (neither exists).
 * Postgres 42703 was swallowed by .catch(() => 45¢ fallback), so estimated
 * deadhead cost always used the hard-coded rate instead of real fuel spend.
 *
 * Static guard (no DB). Also requires fuel.fuel_transactions in the
 * sql-column-existence TARGET_TABLES set so the phantom class cannot return.
 *
 * Rule 17: wired via scripts/verify-steps/1012-verify-deadhead-fuel-columns-real.mjs
 * (do NOT add package.json / locked-guards / ci.yml).
 *
 * Usage:
 *   node scripts/verify-deadhead-fuel-columns-real.mjs
 *   node scripts/verify-deadhead-fuel-columns-real.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SERVICE = "apps/backend/src/reports/deadhead.service.ts";
const COLUMN_GUARD = "scripts/verify-sql-column-existence.mjs";
const LABEL = "verify-deadhead-fuel-columns-real";

/**
 * @param {{ service: string, columnGuard: string }} fixture
 * @returns {string[]}
 */
function checker(fixture) {
  const f = [];
  const serviceSrc = fixture?.service ?? "";
  const columnGuardSrc = fixture?.columnGuard ?? "";

  if (!serviceSrc) {
    f.push(`${SERVICE}: missing`);
    return f;
  }
  if (!columnGuardSrc) {
    f.push(`${COLUMN_GUARD}: missing`);
    return f;
  }

  if (/\bft\.total_miles\b/.test(serviceSrc) || /SUM\(\s*ft\.total_miles\s*\)/.test(serviceSrc)) {
    f.push(`${SERVICE}: must not reference ft.total_miles (column does not exist)`);
  }
  if (/\bft\.transaction_date\b/.test(serviceSrc) || /transaction_date\s*>=/.test(serviceSrc)) {
    f.push(`${SERVICE}: must not reference transaction_date (use transaction_at)`);
  }

  if (!/fuel\.fuel_transactions/.test(serviceSrc)) {
    f.push(`${SERVICE}: must query fuel.fuel_transactions for fuel cost`);
  }
  if (!/\bft\.transaction_at\b/.test(serviceSrc)) {
    f.push(`${SERVICE}: fuel date filter must use ft.transaction_at`);
  }
  if (!/\bft\.total_cost\b/.test(serviceSrc)) {
    f.push(`${SERVICE}: fuel spend must reference ft.total_cost`);
  }
  if (!/\btotalMiles\b/.test(serviceSrc)) {
    f.push(`${SERVICE}: must use report totalMiles as miles denominator (no phantom ft.total_miles)`);
  }

  if (/\.catch\s*\(\s*\(\s*\)\s*=>\s*\(\s*\{\s*rows:\s*\[\s*\{\s*fuel_cost_per_mile_cents/.test(serviceSrc)) {
    f.push(`${SERVICE}: must not blanket-catch fuel query into hard-coded 45¢ fallback`);
  }
  if (/fuel\.fuel_transactions[\s\S]{0,800}\.catch\s*\(/.test(serviceSrc)) {
    f.push(`${SERVICE}: fuel.fuel_transactions query must not be wrapped in .catch (errors must surface)`);
  }

  if (!/"fuel\.fuel_transactions"/.test(columnGuardSrc)) {
    f.push(`${COLUMN_GUARD}: TARGET_TABLES must include "fuel.fuel_transactions"`);
  }

  return f;
}

function loadRepositoryFixture() {
  return {
    service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
    columnGuard: fs.readFileSync(path.join(ROOT, COLUMN_GUARD), "utf8"),
  };
}

const goodFixture = {
  service: `
    const totalMiles = 100;
    const fuelRes = await client.query(\`
      SELECT COALESCE(SUM(ft.total_cost), 0)::text AS total_fuel_cost
      FROM fuel.fuel_transactions ft
      WHERE ft.transaction_at >= $2::date
    \`);
    fuelCpm = Math.round((totalFuelCost / totalMiles) * 100);
  `,
  columnGuard: 'const TARGET_TABLES = new Set(["fuel.fuel_transactions"]);',
};

const badFixture = {
  service:
    "FROM fuel.fuel_transactions ft\n" +
    "WHERE ft.transaction_date >= $2::date\n" +
    "SUM(ft.total_miles)\n" +
    ").catch(() => ({ rows: [{ fuel_cost_per_mile_cents: 45 }] }));",
  columnGuard: 'const TARGET_TABLES = new Set(["mdata.loads"]);',
};

runExecutableGuard({
  label: LABEL,
  checker,
  loadRepositoryFixture,
  goodFixture,
  badFixture,
  expectedBadViolationSubstrings: [
    "ft.total_miles",
    "transaction_date",
    "fuel.fuel_transactions",
  ],
});
