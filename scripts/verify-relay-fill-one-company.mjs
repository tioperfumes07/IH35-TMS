#!/usr/bin/env node
// Lead ruling (ROUND 310, 10-01): ONE Relay fill = ONE live row = ONE company — the company operating the unit that took
// the fuel. Every fill reaches us through ONE Relay org ("IH 35 TRANSPORTATION LLC"), so each company's pull (and the
// webhook) sees every fill; the unique key (operating_company_id, transaction_id) let both companies store it.
// Measured 2026-10-03: 119 fills held by both USMCA and TRANSP (117 are USMCA units, 1 TRANSP, 1 unresolved).
// Static: upsertRelayFuelTransaction resolves the fill's owner BEFORE it writes anything, skips a fill another company
//   owns, and (unit unresolved) skips a fill another company already holds.
// Live: fills held by more than one company <= the committed ceiling (shrink-only; purge population). Any new one FAILS.
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "counts Relay fills stored under more than one company";

const LABEL = "verify-relay-fill-one-company";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";
/** COMMITTED ceiling (shrink-only): cross-company duplicate fills that existed before the writer fix. */
export const DUPLICATE_CEILING = 119;

export function check(svc) {
  const f = [];
  const fn = svc.slice(svc.indexOf("export async function upsertRelayFuelTransaction("));
  const iOwner = fn.indexOf("resolveRelayFillOwnerCompany(");
  const iInsert = fn.indexOf("INSERT INTO integrations.relay_fuel_transactions");
  if (iOwner < 0 || iInsert < 0 || iOwner > iInsert) f.push(`${SVC}: the fill's owner must be resolved before anything is written`);
  if (!/if \(ownerCompanyId && ownerCompanyId !== operatingCompanyId\) return skipped\("owned_by_other_company"\)/.test(fn)) {
    f.push(`${SVC}: a fill owned by another company must be skipped`);
  }
  if (!/if \(heldElsewhere\.rows\[0\]\?\.ok\) return skipped\("already_held_by_other_company"\)/.test(fn)) {
    f.push(`${SVC}: an unresolved fill already held by another company must be skipped`);
  }
  if (!/COALESCE\(currently_leased_to_company_id, owner_company_id\)/.test(svc)) f.push(`${SVC}: the owner is the unit's operator (lessee, else owner)`);
  return f;
}

export function judge(duplicates) {
  return duplicates > DUPLICATE_CEILING
    ? [`${duplicates} Relay fills are held by more than one company — ceiling ${DUPLICATE_CEILING}; the ingest stored a fill twice`]
    : [];
}

const read = () => fs.readFileSync(path.join(ROOT, SVC), "utf8");

if (process.argv.includes("--selftest")) {
  const real = read();
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["owner resolved after insert", real.replace("const ownerCompanyId = await resolveRelayFillOwnerCompany(client, truckNumber);", "const ownerCompanyId: string | null = null;")],
    ["other company's fill stored", real.replace('if (ownerCompanyId && ownerCompanyId !== operatingCompanyId) return skipped("owned_by_other_company");', "")],
    ["second copy of an unresolved fill", real.replace('if (heldElsewhere.rows[0]?.ok) return skipped("already_held_by_other_company");', "")],
  ];
  for (const [name, s] of plants) {
    if (s === real) fails.push(`plant did not change the source: ${name}`);
    else if (check(s).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (judge(DUPLICATE_CEILING + 1).length !== 1) fails.push("a new duplicate not caught");
  if (judge(DUPLICATE_CEILING).length !== 0) fails.push("the committed ceiling flagged");
  const n = plants.length + 2;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const fails = check(read());
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = await c.query(`
    SELECT (SELECT count(*) FROM integrations.relay_fuel_transactions)::int AS total,
           (SELECT count(*) FROM (SELECT transaction_id FROM integrations.relay_fuel_transactions
                                   GROUP BY transaction_id HAVING count(DISTINCT operating_company_id) > 1) d)::int AS duplicates`);
  await c.query("ROLLBACK");
  const { total, duplicates } = r.rows[0];
  if (total === 0) { console.error(`${LABEL}: FAIL — 0 Relay rows read; an empty result is an instrument problem, not a pass`); process.exit(1); }
  const bad = judge(duplicates);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${total} Relay rows; ${duplicates} fills held by more than one company (committed ceiling ${DUPLICATE_CEILING}, shrink-only)`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
