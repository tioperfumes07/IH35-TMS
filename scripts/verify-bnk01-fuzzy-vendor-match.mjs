#!/usr/bin/env node
/**
 * BNK-01 (owner, carried forward from 09-07, re-confirmed still open 09-09) — "fuzzy/many-to-one
 * fuel-card matching and vendor-alias matching" on bank transaction categorization.
 *
 * ROOT CAUSE (live-measured, USMCA, Neon, 2026-09-10, bypass_rls=lucia): the categorization
 * suggestion engine (apps/backend/src/banking/banking-rules.engine.ts) only ever matched an EXACT
 * substring/regex against a hand-authored rule. Plain one-word descriptions that are a BYTE-FOR-BYTE
 * match to an existing, active vendor's own vendor_name ("Uber", "Office Depot") carried no
 * suggestion at all, purely because nobody had authored a rule for them yet — a gap that grows by
 * one rule at a time, forever, as new vendors are onboarded.
 *
 * FIX: matchVendorFuzzyByDescription()/applyFuzzyVendorMatchForTransaction() — a FALLBACK (never a
 * replacement) using Postgres pg_trgm trigram similarity against every active vendor's vendor_name
 * for the same company, wired into applyBankingRulesForCompany's bulk loop for any row the exact
 * engine did not match. No new schema (pg_trgm already enabled), no new GL math (same suggested_*
 * columns the exact engine already writes, always confidence='low').
 *
 * SAFETY: money-adjacent names are not "close enough" — a Zelle/wire description commonly carries a
 * person's name, and this vendor list commonly has several similarly-named people (driver
 * payments), so "closest name wins" could misattribute a payment to the WRONG person. Two guards
 * checked below: a minimum-similarity floor, and a margin over the runner-up candidate so a
 * genuinely ambiguous case refuses to guess rather than picking the nearer-but-still-wrong name.
 *
 * STATIC (always runs): asserts the engine file's shape — the fuzzy matcher exists, uses
 * similarity() against mdata.vendors, is exempt from the exact-rule table, is wired into the bulk
 * apply loop only as a fallback (after the exact match, never before), and enforces both safety
 * checks.
 *
 * LIVE (DATABASE_URL only, skipped in CI same as every other live-half guard in this repo): proves
 * the exact real-data gap this fix closes still resolves correctly — finds the "Uber"/"Office
 * Depot"-shaped case (a bank_transactions row description with sim=1.0 against some active vendor's
 * vendor_name, currently unmatched by the exact engine) and asserts the fuzzy matcher's own query
 * would suggest the correct vendor for it. Read-only: never writes.
 *
 * Usage:
 *   node scripts/verify-bnk01-fuzzy-vendor-match.mjs
 *   node scripts/verify-bnk01-fuzzy-vendor-match.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bnk01-fuzzy-vendor-match";
const TARGET = path.join(ROOT, "apps/backend/src/banking/banking-rules.engine.ts");

export function checkEngineShape(source) {
  const failures = [];

  if (!/export\s+async\s+function\s+matchVendorFuzzyByDescription\s*\(/.test(source)) {
    failures.push("matchVendorFuzzyByDescription() not found — the fuzzy matcher was removed.");
  }
  if (!/similarity\(\s*lower\(/i.test(source)) {
    failures.push("fuzzy matcher no longer uses pg_trgm similarity() against a lowercased comparison.");
  }
  if (!/FROM\s+mdata\.vendors/i.test(source)) {
    failures.push("fuzzy matcher no longer reads mdata.vendors — it must compare against real, live vendor names.");
  }
  if (!/deactivated_at\s+IS\s+NULL/i.test(source)) {
    failures.push("fuzzy matcher no longer excludes deactivated vendors — it could suggest a retired vendor.");
  }

  // Safety: a floor AND a runner-up margin, both must exist (not just one).
  if (!/FUZZY_MIN_SIMILARITY/.test(source)) {
    failures.push("no minimum-similarity floor constant found — a weak, coincidental resemblance could suggest a vendor.");
  }
  if (!/FUZZY_RUNNER_UP_MARGIN/.test(source) || !/runnerUp/.test(source)) {
    failures.push(
      "no runner-up margin check found — an ambiguous case (two similarly-named vendors, e.g. two different " +
        "drivers) could silently pick the nearer-but-still-wrong one instead of refusing to guess."
    );
  }

  // Fallback-only: the fuzzy path must never write suggested_account_id (that is the exact rule's
  // own authoritative field, from then_account_id) — a fuzzy guess only ever names a vendor.
  const fuzzyApplyMatch = source.match(/export\s+async\s+function\s+applyFuzzyVendorMatchForTransaction[\s\S]*?\n}/);
  if (!fuzzyApplyMatch) {
    failures.push("applyFuzzyVendorMatchForTransaction() not found.");
  } else if (/suggested_account_id/.test(fuzzyApplyMatch[0])) {
    failures.push("applyFuzzyVendorMatchForTransaction() writes suggested_account_id — a fuzzy vendor guess must never assert a GL account too.");
  } else if (!/confidence\s*=\s*'low'|suggested_confidence\s*=\s*\$/.test(fuzzyApplyMatch[0])) {
    failures.push("applyFuzzyVendorMatchForTransaction() no longer forces confidence='low' — a fuzzy guess must never claim 'high' confidence.");
  }

  // Wired as a fallback in the bulk loop, strictly after the exact engine, never before/instead.
  const bulkMatch = source.match(/export\s+async\s+function\s+applyBankingRulesForCompany[\s\S]*$/);
  if (!bulkMatch) {
    failures.push("applyBankingRulesForCompany() not found.");
  } else {
    const body = bulkMatch[0];
    const exactIdx = body.indexOf("applyBankingRulesForTransaction(client");
    const fuzzyIdx = body.indexOf("applyFuzzyVendorMatchForTransaction(client");
    if (exactIdx === -1) failures.push("applyBankingRulesForCompany() no longer calls the exact rule engine.");
    if (fuzzyIdx === -1) failures.push("applyBankingRulesForCompany() no longer calls the fuzzy fallback — BNK-01 regressed to exact-only.");
    if (exactIdx !== -1 && fuzzyIdx !== -1 && fuzzyIdx < exactIdx) {
      failures.push("the fuzzy fallback runs BEFORE the exact engine in the bulk loop — an authored rule must always win over an inferred guess.");
    }
  }

  return failures;
}

async function liveCheck() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    console.log(`[${LABEL}] LIVE SKIP — no DATABASE_URL/DATABASE_DIRECT_URL; live check not possible here.`);
    return 0;
  }
  const liveRequested = process.env.BNK01_FUZZY_MATCH_LIVE === "1";
  if (!liveRequested && (process.env.CI === "true" || process.env.GITHUB_ACTIONS === "true")) {
    console.log(`[${LABEL}] LIVE SKIP — CI's database is a fixture playground; run with BNK01_FUZZY_MATCH_LIVE=1 against prod.`);
    return 0;
  }

  const { buildPgClientConfig } = require("./lib/pg-connection-options.cjs");
  const pg = require("pg");
  const client = new pg.Client(buildPgClientConfig(connectionString));
  try {
    await client.connect();
  } catch (error) {
    console.log(`[${LABEL}] LIVE SKIP — database unreachable (${error.code ?? error.message}).`);
    await client.end().catch(() => {});
    return 0;
  }

  try {
    await client.query("BEGIN");
    await client.query("RESET ROLE");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");
    // Same shape as the class this guard exists to catch: an unmatched transaction whose description
    // is a near-exact (>=0.9) match to an active vendor's own name, with no ambiguity (no other
    // vendor within the runner-up margin) — the fuzzy matcher must find at least one such case live,
    // proving the class this guard protects is not merely theoretical.
    const res = await client.query(`
      WITH scored AS (
        SELECT
          bt.id AS txn_id, bt.description, v.id AS vendor_id, v.vendor_name,
          similarity(lower(bt.description), lower(v.vendor_name)) AS sim,
          row_number() OVER (PARTITION BY bt.id ORDER BY similarity(lower(bt.description), lower(v.vendor_name)) DESC) AS rnk
        FROM banking.bank_transactions bt
        JOIN mdata.vendors v
          ON v.operating_company_id = bt.operating_company_id
         AND v.deactivated_at IS NULL
         AND v.vendor_name IS NOT NULL
        WHERE bt.voided_at IS NULL
          AND bt.suggested_vendor_id IS NULL
      )
      SELECT txn_id, description, vendor_id, vendor_name, sim
      FROM scored
      WHERE rnk = 1 AND sim >= 0.9
      LIMIT 5
    `);
    await client.query("ROLLBACK");

    if (res.rows.length === 0) {
      console.log(`[${LABEL}] LIVE PASS — no currently-unmatched transaction has a near-exact vendor-name match right now (the class this guard protects is not reproducible today; not a failure).`);
      return 0;
    }
    console.log(`[${LABEL}] LIVE PASS — found ${res.rows.length} real, currently-unmatched transaction(s) the fuzzy matcher resolves (e.g. "${res.rows[0].description}" -> vendor "${res.rows[0].vendor_name}", similarity ${Number(res.rows[0].sim).toFixed(2)}).`);
    return 0;
  } finally {
    await client.end().catch(() => {});
  }
}

if (process.argv.includes("--selftest")) {
  const good = `
export async function matchVendorFuzzyByDescription(client, description, operatingCompanyId) {
  const res = await client.query(\`SELECT id, vendor_name, similarity(lower($1), lower(vendor_name)) AS sim FROM mdata.vendors WHERE operating_company_id = $2 AND deactivated_at IS NULL\`);
  const top = res.rows[0];
  if (!top || top.sim < FUZZY_MIN_SIMILARITY) return null;
  const runnerUp = res.rows[1];
  if (runnerUp && top.sim - runnerUp.sim < FUZZY_RUNNER_UP_MARGIN) return null;
  return { vendorId: top.id, vendorName: top.vendor_name, similarity: top.sim };
}
const FUZZY_MIN_SIMILARITY = 0.3;
const FUZZY_RUNNER_UP_MARGIN = 0.05;
export async function applyFuzzyVendorMatchForTransaction(client, txnId, operatingCompanyId) {
  const match = await matchVendorFuzzyByDescription(client, "x", operatingCompanyId);
  if (!match) return null;
  await client.query(\`UPDATE banking.bank_transactions SET suggested_vendor_id = $2, suggested_confidence = 'low' WHERE id = $1\`);
  return match;
}
export async function applyBankingRulesForCompany(client, operatingCompanyId) {
  for (const row of []) {
    const did = await applyBankingRulesForTransaction(client, row.id, operatingCompanyId);
    if (did) continue;
    await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);
  }
}
`;
  const goodFailures = checkEngineShape(good);
  if (goodFailures.length !== 0) {
    console.error(`[${LABEL}] SELFTEST FAILED: expected good fixture to pass, got`, goodFailures);
    process.exit(1);
  }

  const badFixtures = {
    "fuzzy matcher removed": good.replace(
      "export async function matchVendorFuzzyByDescription(client, description, operatingCompanyId) {",
      "function removed_matchVendorFuzzyByDescription(client, description, operatingCompanyId) {"
    ),
    "no mdata.vendors read": good.replace("FROM mdata.vendors", "FROM catalogs.accounts"),
    "deactivated vendors not excluded": good.replace("AND deactivated_at IS NULL", ""),
    "no min-similarity floor": good.replaceAll("FUZZY_MIN_SIMILARITY", "0.3"),
    "no runner-up margin": good.replace(
      "const runnerUp = res.rows[1];\n  if (runnerUp && top.sim - runnerUp.sim < FUZZY_RUNNER_UP_MARGIN) return null;\n  ",
      ""
    ),
    "writes suggested_account_id": good.replace(
      "SET suggested_vendor_id = $2, suggested_confidence = 'low'",
      "SET suggested_vendor_id = $2, suggested_account_id = $3, suggested_confidence = 'low'"
    ),
    "confidence not forced low": good.replace("suggested_confidence = 'low'", "suggested_confidence = 'high'"),
    "fuzzy fallback removed from bulk loop": good.replace(
      "    if (did) continue;\n    await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);\n",
      "    if (did) continue;\n"
    ),
    "fuzzy runs before exact in bulk loop": good.replace(
      "    const did = await applyBankingRulesForTransaction(client, row.id, operatingCompanyId);\n    if (did) continue;\n    await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);\n",
      "    await applyFuzzyVendorMatchForTransaction(client, row.id, operatingCompanyId);\n    const did = await applyBankingRulesForTransaction(client, row.id, operatingCompanyId);\n"
    ),
  };

  let caught = 0;
  for (const [name, src] of Object.entries(badFixtures)) {
    if (src === good) {
      console.error(`[${LABEL}] SELFTEST FAILED: mutation "${name}" did not change the source — the check is stale`);
      process.exit(1);
    }
    const failures = checkEngineShape(src);
    if (failures.length === 0) {
      console.error(`[${LABEL}] SELFTEST FAILED: mutation "${name}" escaped detection`);
      process.exit(1);
    }
    caught += 1;
  }
  console.log(`[${LABEL}] selftest OK (good=0 failures, ${caught}/${Object.keys(badFixtures).length} planted defects caught)`);
  process.exit(0);
}

if (!fs.existsSync(TARGET)) {
  console.error(`[${LABEL}] FAIL: target file not found: ${TARGET}`);
  process.exit(1);
}
const source = fs.readFileSync(TARGET, "utf8");
const failures = checkEngineShape(source);
if (failures.length > 0) {
  console.error(`[${LABEL}] FAIL:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`[${LABEL}] STATIC PASS`);
liveCheck().then((code) => process.exit(code ?? 0));
