#!/usr/bin/env node
/**
 * ACCT-COA-CANONICALIZATION — reconciliation report.
 *
 * Reconciles the canonical posting chart of accounts (catalogs.accounts, ~370 rows,
 * GLOBAL / no operating_company_id) against the QBO mirror TRANSP slice
 * (accounting.qbo_accounts WHERE operating_company.code = 'TRANSP', ~365 rows).
 *
 * This is REPORT-ONLY. It never writes to catalogs.accounts or accounting.qbo_accounts.
 * It prints match counts to stdout and writes a committed audit artifact at
 * docs/audits/COA-QBO-RECONCILIATION.json that records the buckets and the
 * suggested verifier coverage threshold consumed by scripts/verify-coa-canonical.mjs.
 *
 * Matching strategy (conservative, bijective):
 *   1. Primary key = normalized account name: lower(btrim(collapse_whitespace(name))).
 *   2. Type-class validation: QBO account_type is mapped to the canonical 8-value
 *      catalogs taxonomy; a name match is CONFIRMED only if the mapped class equals
 *      catalogs.accounts.account_type.
 *   3. A pair is only "matched" when the normalized name is unique on BOTH sides
 *      (bijective). Non-unique names => ambiguous; name match + type mismatch => conflict.
 *
 * Buckets: matched | conflict | ambiguous | tmsOnly | qboOnly
 */
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { fileURLToPath } from "node:url";

dotenv.config();

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ARTIFACT = path.join(ROOT, "docs/audits/COA-QBO-RECONCILIATION.json");

function fail(msg) {
  console.error(`reconcile:coa-qbo FAIL: ${msg}`);
  process.exit(1);
}

/** Map a raw QBO AccountType to the canonical catalogs.accounts.account_type taxonomy. */
export function mapQboTypeToCanonical(qboType) {
  switch ((qboType || "").trim()) {
    case "Bank":
    case "Accounts Receivable":
    case "Other Current Asset":
    case "Fixed Asset":
    case "Other Asset":
      return "Asset";
    case "Accounts Payable":
    case "Credit Card":
    case "Other Current Liability":
    case "Long Term Liability":
      return "Liability";
    case "Equity":
      return "Equity";
    case "Income":
      return "Income";
    case "Expense":
      return "Expense";
    case "Cost of Goods Sold":
      return "CostOfGoodsSold";
    case "Other Income":
      return "OtherIncome";
    case "Other Expense":
      return "OtherExpense";
    default:
      return null; // unknown -> never auto-confirm
  }
}

/** Normalization must match the SQL: lower(btrim(regexp_replace(name,'\\s+',' ','g'))). */
function norm(name) {
  return String(name ?? "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");
}

async function withBypass(client, sql, params = []) {
  await client.query("BEGIN");
  try {
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");
    const res = await client.query(sql, params);
    await client.query("COMMIT");
    return res;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  }
}

function computeBuckets(tmsRows, qboRows) {
  const qboByName = new Map();
  for (const q of qboRows) {
    const k = norm(q.name);
    if (!qboByName.has(k)) qboByName.set(k, []);
    qboByName.get(k).push(q);
  }
  const tmsByName = new Map();
  for (const t of tmsRows) {
    const k = norm(t.account_name);
    if (!tmsByName.has(k)) tmsByName.set(k, []);
    tmsByName.get(k).push(t);
  }

  const matched = [];
  const conflict = [];
  const ambiguous = [];
  const tmsOnly = [];

  for (const t of tmsRows) {
    const k = norm(t.account_name);
    const qMatches = qboByName.get(k) || [];
    const tSiblings = tmsByName.get(k) || [];
    if (qMatches.length === 0) {
      tmsOnly.push({ tms_id: t.id, account_number: t.account_number, account_name: t.account_name, account_type: t.account_type });
      continue;
    }
    if (qMatches.length > 1 || tSiblings.length > 1) {
      ambiguous.push({
        tms_id: t.id,
        account_number: t.account_number,
        account_name: t.account_name,
        account_type: t.account_type,
        qbo_candidate_count: qMatches.length,
        tms_name_collision_count: tSiblings.length,
      });
      continue;
    }
    const q = qMatches[0];
    const mappedType = mapQboTypeToCanonical(q.account_type);
    if (mappedType && mappedType === t.account_type) {
      matched.push({
        tms_id: t.id,
        account_number: t.account_number,
        account_name: t.account_name,
        account_type: t.account_type,
        qbo_id: q.qbo_id,
        qbo_name: q.name,
        qbo_type: q.account_type,
      });
    } else {
      conflict.push({
        tms_id: t.id,
        account_number: t.account_number,
        account_name: t.account_name,
        tms_type: t.account_type,
        qbo_id: q.qbo_id,
        qbo_type: q.account_type,
        mapped_type: mappedType,
      });
    }
  }

  const qboOnly = [];
  for (const q of qboRows) {
    const k = norm(q.name);
    if (!tmsByName.has(k)) {
      qboOnly.push({ qbo_id: q.qbo_id, qbo_name: q.name, qbo_type: q.account_type });
    }
  }

  return { matched, conflict, ambiguous, tmsOnly, qboOnly };
}

function suggestThreshold(matchedCount, matchableCount) {
  if (matchableCount <= 0) return 50;
  const observedPct = Math.round((matchedCount / matchableCount) * 100);
  const flooredTo5 = Math.floor(observedPct / 5) * 5;
  // one notch (5%) below observed for CI headroom, floored at 50%
  const suggested = flooredTo5 === observedPct ? flooredTo5 - 5 : flooredTo5;
  return Math.max(50, suggested);
}

async function main() {
  const connectionString = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!connectionString) {
    fail("DATABASE_DIRECT_URL or DATABASE_URL required to run the reconciliation report");
  }

  const pool = new pg.Pool({ connectionString });
  const client = await pool.connect();
  let buckets;
  let transpId;
  try {
    await client.query("SET ROLE ih35_app");

    const companyRes = await withBypass(
      client,
      `SELECT id::text AS id FROM org.companies WHERE code = 'TRANSP' LIMIT 1`
    );
    transpId = companyRes.rows[0]?.id;
    if (!transpId) fail("TRANSP company not found in org.companies");

    const tmsRes = await withBypass(
      client,
      `SELECT id::text AS id, account_number, account_name, account_type, account_subtype, qbo_account_id
         FROM catalogs.accounts`
    );

    const qboRes = await withBypass(
      client,
      `SELECT qa.qbo_id, qa.name, qa.full_qualified_name, qa.account_type, qa.account_sub_type, qa.active
         FROM accounting.qbo_accounts qa
        WHERE qa.operating_company_id = $1::uuid`,
      [transpId]
    );

    buckets = computeBuckets(tmsRes.rows, qboRes.rows);
    buckets._totals = { tms_total: tmsRes.rows.length, qbo_transp_total: qboRes.rows.length };
  } finally {
    client.release();
    await pool.end();
  }

  const { matched, conflict, ambiguous, tmsOnly, qboOnly, _totals } = buckets;
  const matchableCount = matched.length + conflict.length + ambiguous.length;
  const suggestedThreshold = suggestThreshold(matched.length, matchableCount);
  const observedPct = matchableCount > 0 ? Math.round((matched.length / matchableCount) * 100) : 0;

  const report = {
    block: "ACCT-COA-CANONICALIZATION",
    generated_at: new Date().toISOString(),
    canonical_coa: "catalogs.accounts",
    qbo_mirror: "accounting.qbo_accounts (TRANSP slice)",
    transp_company_id: transpId,
    totals: {
      tms_catalogs_accounts: _totals.tms_total,
      qbo_accounts_transp: _totals.qbo_transp_total,
      matched: matched.length,
      conflict: conflict.length,
      ambiguous: ambiguous.length,
      tms_only: tmsOnly.length,
      qbo_only: qboOnly.length,
      matchable: matchableCount,
    },
    coverage: {
      observed_matched_pct_of_matchable: observedPct,
      suggested_verifier_threshold_pct: suggestedThreshold,
      floor_pct: 50,
      env_override: "COA_QBO_LINK_MIN_PCT",
    },
    matched,
    conflict,
    ambiguous,
    tms_only: tmsOnly,
    qbo_only: qboOnly,
  };

  fs.mkdirSync(path.dirname(ARTIFACT), { recursive: true });
  fs.writeFileSync(ARTIFACT, JSON.stringify(report, null, 2) + "\n");

  console.log("=== COA <-> QBO reconciliation report ===");
  console.log(`canonical COA           : catalogs.accounts (${_totals.tms_total} rows)`);
  console.log(`QBO mirror (TRANSP)     : accounting.qbo_accounts (${_totals.qbo_transp_total} rows)`);
  console.log("-----------------------------------------");
  console.log(`matched (confirmed)     : ${matched.length}`);
  console.log(`conflict (name/type)    : ${conflict.length}`);
  console.log(`ambiguous (non-unique)  : ${ambiguous.length}`);
  console.log(`TMS-only (no QBO match) : ${tmsOnly.length}`);
  console.log(`QBO-only (no TMS match) : ${qboOnly.length}`);
  console.log("-----------------------------------------");
  console.log(`matchable (m+c+a)       : ${matchableCount}`);
  console.log(`observed matched %      : ${observedPct}%`);
  console.log(`suggested threshold     : ${suggestedThreshold}% (floor 50%, override COA_QBO_LINK_MIN_PCT)`);
  console.log(`artifact written        : ${path.relative(ROOT, ARTIFACT)}`);
}

main().catch((err) => fail(String(err?.stack || err?.message || err)));
