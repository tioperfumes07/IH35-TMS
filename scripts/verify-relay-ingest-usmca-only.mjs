#!/usr/bin/env node
// ROUND 443.15 (owner, 2026-10-10): USMCA runs on the IH 35 Transportation Relay key; a Relay fill is stored ONCE,
// under USMCA only. Measured on production 2026-10-10: the RELAY_FUEL_INGEST_ENABLED override was ON for TRANSP
// (since 10-01) and USMCA (since 09-08); both pulls return the same Relay org's fills (all 172 cross-company pairs are
// identical — same time, amount, linked org "IH 35 TRANSPORTATION LLC"); and the "already held by another company"
// check ran only when the fill's unit was unresolved, so on 10-08 the USMCA pull stored 53 fills TRANSP already held.
//
// Static:
//   1. upsertRelayFuelTransaction refuses a non-USMCA company before its first query;
//   2. the already-held-by-another-company check runs for EVERY fill (not only an unresolved unit) and before the INSERT;
//   3. both cron company loops skip a non-USMCA company before the flag read (no Relay call, no sync-log row).
// Live: no fill held by more than one company whose second copy was stored after FIX_CUTOFF. No ceiling, nothing
//   raised: the 172 pairs that pre-date the fix stay exactly where they are (moving or voiding a Relay row needs the
//   owner's word) and remain counted by verify-relay-fill-one-company.
// --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
export const REQUIRES_LIVE_DB = "counts Relay fills stored under a second company after the 443.15 fix";

const LABEL = "verify-relay-ingest-usmca-only";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SVC = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts";
const CRON = "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.cron.ts";
/** Merge time of the 443.15 fix; every second copy stored at or after this is a regression. */
export const FIX_CUTOFF = "2026-10-10T22:00:00Z";

export function check(svc, cron) {
  const f = [];
  const fn = svc.slice(svc.indexOf("export async function upsertRelayFuelTransaction("));
  const iUsmca = fn.indexOf('if (!isUsmcaOperatingCompany(operatingCompanyId)) return skipped("not_usmca_relay_company");');
  const iFirstQuery = fn.search(/await (client\.query|resolveRelayFillOwnerCompany)\(/);
  if (iUsmca < 0 || (iFirstQuery >= 0 && iUsmca > iFirstQuery)) f.push(`${SVC}: a non-USMCA company must be refused before the first query`);
  const iHeld = fn.indexOf('if (heldElsewhere.rows[0]?.ok) return skipped("already_held_by_other_company");');
  const iInsert = fn.indexOf("INSERT INTO integrations.relay_fuel_transactions");
  if (iHeld < 0 || iInsert < 0 || iHeld > iInsert) f.push(`${SVC}: a fill already held by another company must be skipped before the INSERT`);
  const beforeHeld = fn.slice(0, iHeld < 0 ? 0 : iHeld);
  if (/if \(!ownerCompanyId\) \{[^}]*const heldElsewhere/.test(beforeHeld)) f.push(`${SVC}: the already-held check is gated on an unresolved unit again — a resolved unit would store a second copy`);
  const loops = cron.split("for (const { id: operatingCompanyId, code: entityCode } of companyIds) {").slice(1);
  if (loops.length !== 2) f.push(`${CRON}: expected the daily and backfill company loops (found ${loops.length})`);
  for (const [i, body] of loops.entries()) {
    const iSkip = body.indexOf("if (!isUsmcaOperatingCompany(operatingCompanyId)) continue;");
    const iFlag = body.indexOf('"RELAY_FUEL_INGEST_ENABLED"');
    if (iSkip < 0 || iFlag < 0 || iSkip > iFlag) f.push(`${CRON}: company loop ${i + 1} must skip a non-USMCA company before the flag read`);
  }
  return f;
}

export function judge(newPairs) {
  return newPairs > 0 ? [`${newPairs} Relay fill(s) stored under a second company after ${FIX_CUTOFF} — the ingest stored a fill twice`] : [];
}

const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

if (process.argv.includes("--selftest")) {
  const svc = read(SVC);
  const cron = read(CRON);
  const fails = [];
  if (check(svc, cron).length) fails.push(`tree not clean: ${check(svc, cron).join("; ")}`);
  const plants = [
    ["non-USMCA allowed", svc.replace('  if (!isUsmcaOperatingCompany(operatingCompanyId)) return skipped("not_usmca_relay_company");\n', ""), cron],
    ["held check gated on unresolved unit again", svc.replace("  {\n    const heldElsewhere", "  if (!ownerCompanyId) {\n    const heldElsewhere"), cron],
    ["held check removed", svc.replace('if (heldElsewhere.rows[0]?.ok) return skipped("already_held_by_other_company");', ""), cron],
    ["daily loop pulls every company", svc, cron.replace("    if (!isUsmcaOperatingCompany(operatingCompanyId)) continue;\n", "")],
    ["backfill loop pulls every company", svc, (() => { const i = cron.lastIndexOf("    if (!isUsmcaOperatingCompany(operatingCompanyId)) continue;\n"); return cron.slice(0, i) + cron.slice(i + 66); })()],
  ];
  for (const [name, s, c] of plants) {
    if (s === svc && c === cron) fails.push(`plant did not change the source: ${name}`);
    else if (check(s, c).length === 0) fails.push(`plant escaped: ${name}`);
  }
  if (judge(1).length !== 1) fails.push("a new cross-company fill not caught");
  if (judge(0).length !== 0) fails.push("zero new fills flagged");
  const n = plants.length + 2;
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${n}/${n}`);
  process.exit(0);
}

const fails = check(read(SVC), read(CRON));
if (fails.length) { console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`); process.exit(1); }
if (!process.env.DATABASE_URL) { console.error(`${LABEL}: FAIL — static passed; the live check needs DATABASE_URL`); process.exit(1); }
const { default: pg } = await import("pg");
const c = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 15000, statement_timeout: 30000 });
try {
  await c.connect();
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = await c.query(
    `SELECT (SELECT count(*) FROM integrations.relay_fuel_transactions)::int AS total,
            (SELECT count(*) FROM integrations.relay_fuel_transactions a
               JOIN integrations.relay_fuel_transactions b
                 ON a.transaction_id = b.transaction_id AND a.operating_company_id <> b.operating_company_id
              WHERE a.created_at >= b.created_at AND a.created_at >= $1::timestamptz)::int AS new_pairs`,
    [FIX_CUTOFF]
  );
  await c.query("ROLLBACK");
  const { total, new_pairs: newPairs } = r.rows[0];
  if (total === 0) { console.error(`${LABEL}: FAIL — 0 Relay rows read; an empty result is an instrument problem, not a pass`); process.exit(1); }
  const bad = judge(newPairs);
  if (bad.length) { console.error(`${LABEL}: FAIL\n  ${bad.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: PASS — ${total} Relay rows; 0 fills stored under a second company since ${FIX_CUTOFF}`);
} catch (err) {
  console.error(`${LABEL}: FAIL — live check could not run: ${err.message}`);
  process.exit(1);
} finally {
  await c.end().catch(() => {});
}
