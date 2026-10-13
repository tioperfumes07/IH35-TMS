#!/usr/bin/env node
/**
 * GUARD — OWNER RULING (Lead 443.53 #6, CC-3): "the payment to any driver is the payment that is in the settlements, so if
 * the rate is .45 then that is the rate." A driver's rate card follows the rate their signed settlements paid.
 *   RULE 1 (static) — a card corrected back to an EARLIER date supersedes the open card that starts later: the
 *     driver_finance mirror deactivates open rows with effective_from >= the new date (not only the same day), and the
 *     qualification rates/change route treats a backdated rate like a same-day correction. Otherwise the later 48c row
 *     stays open and wins resolveDriverBasePayCents' `ORDER BY effective_from DESC`.
 *   RULE 2 (live) — for every driver on a live USMCA Creator settlement whose loaded-mile settlement lines ALL agree on
 *     one rate, the driver's open card (driver_finance.driver_pay_rates, active, effective_to NULL, per_mile_pay) is that
 *     rate. Drivers whose settlements disagree among themselves are listed, never failed (owner: list only). A
 *     salaried (local driver) week has no loaded-mile line and is not compared.
 * Run: node scripts/verify-settlement-creator-card-rate-is-settlement-rate.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a rate card that disagrees with the signed settlements prices the next load wrong — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-card-rate-is-settlement-rate";
const SRC = "apps/backend/src/mdata/driver-profile.routes.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
/** Shrink-only: driver ids whose card is still being corrected through the pay-rate engine (Lead 443.53 #6). Measured
 * 2026-10-11 14:30 UTC: 14 (13 on the 48c fleet default, 1 with no card); 14:50 UTC: 9 corrected through
 * POST /api/v1/mdata/drivers/:id/qualifications -> 5 left, all starting before the 48c card's 2026-08-07; 15:32 UTC: those 5
 * corrected the same way once #26378 was live -> 0 (Lead 443.60: 14 of 14). */
export const KNOWN_CARD_MISMATCH = new Set([]);

export function staticProblems(src) {
  const p = [];
  const mirror = src.match(/async function syncDriverFinancePayRateFromQualificationRate[\s\S]*?\n}\n/)?.[0] ?? "";
  if (!/SET is_active = false, updated_by_user_id = \$3, updated_at = now\(\)\s+WHERE driver_id = \$2::uuid\s+AND operating_company_id = \$4::uuid\s+AND effective_to IS NULL\s+AND effective_from >= \$1::date/.test(mirror))
    p.push("RULE 1 the driver_finance mirror leaves an open card that starts after a backdated correction open (or reaches another company's card)");
  if (!/AND operating_company_id = \$4::uuid\s+AND effective_to IS NULL\s+AND effective_from < \$1::date/.test(mirror))
    p.push("RULE 1 the driver_finance mirror closes cards without naming the company (another company's card is reachable)");
  if (!/const backdatedCorrection = Boolean\(previousEffectiveFrom && previousEffectiveFrom > effectiveFrom\);/.test(src) || !/if \(sameDayCorrection \|\| backdatedCorrection\) \{/.test(src))
    p.push("RULE 1 the rates/change route closes a later-starting rate before it began instead of superseding it");
  return p;
}

/** rows: [{ driver_id, driver, rates: number[], card: number|null, setl_nos }] */
export function liveProblems(rows, known = KNOWN_CARD_MISMATCH) {
  const p = [];
  for (const r of rows) {
    const rates = [...new Set((r.rates ?? []).map(Number))];
    if (rates.length !== 1 || known.has(r.driver_id)) continue;
    if (r.card == null || Number(r.card) !== rates[0])
      p.push(`RULE 2 ${r.driver}: card ${r.card ?? "none"}c, every settlement (${r.setl_nos}) paid ${rates[0]}c`);
  }
  return p;
}

function selftest() {
  const src = fs.readFileSync(path.join(ROOT, SRC), "utf8");
  const ok = { driver_id: "a", driver: "A", rates: [45, 45], card: 45, setl_nos: "1,2" };
  const cases = [
    ["real source clean", staticProblems(src).length === 0],
    ["same-day-only mirror fails", staticProblems(src.replace("AND effective_from >= $1::date", "AND effective_from = $1::date")).length > 0],
    ["unscoped close fails", staticProblems(src.replace(/AND operating_company_id = \$4::uuid(\s+AND effective_to IS NULL\s+AND effective_from < )/, "$1")).length > 0],
    ["route without backdated supersede fails", staticProblems(src.replace("if (sameDayCorrection || backdatedCorrection) {", "if (sameDayCorrection) {")).length > 0],
    ["card = settlement rate passes", liveProblems([ok]).length === 0],
    ["card 48 vs settlements 45 fails", liveProblems([{ ...ok, card: 48 }]).length > 0],
    ["no card vs settlements 45 fails", liveProblems([{ ...ok, card: null }]).length > 0],
    ["settlements that disagree are listed, not failed", liveProblems([{ ...ok, rates: [45, 50], card: 48 }]).length === 0],
    ["salaried (no loaded line) is not compared", liveProblems([{ ...ok, rates: [], card: 45 }]).length === 0],
    ["a known id is excused", liveProblems([{ ...ok, card: 48 }], new Set(["a"])).length === 0],
  ];
  const bad = cases.filter(([, k]) => !k).map(([n]) => n);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${cases.length}/${cases.length})`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(fs.readFileSync(path.join(ROOT, SRC), "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let rows;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    rows = (await client.query(
      `SELECT s.driver_id::text AS driver_id, trim(coalesce(d.first_name, '') || ' ' || coalesce(d.last_name, '')) AS driver,
              string_agg(DISTINCT s.source_document_ref, ',' ORDER BY s.source_document_ref) AS setl_nos,
              COALESCE(array_agg(DISTINCT sl.rate_cents::numeric) FILTER (WHERE sl.id IS NOT NULL), '{}') AS rates,
              (SELECT r.rate_per_mile_cents::numeric FROM driver_finance.driver_pay_rates r
                WHERE r.operating_company_id = $1::uuid AND r.driver_id = s.driver_id AND r.is_active AND r.effective_to IS NULL
                  AND r.basis_type = 'per_mile_pay'
                ORDER BY r.effective_from DESC LIMIT 1) AS card
         FROM driver_finance.driver_settlements s
         JOIN mdata.drivers d ON d.id = s.driver_id
         LEFT JOIN driver_finance.settlement_lines sl
           ON sl.settlement_id = s.id AND sl.category = 'loaded_miles' AND sl.voided_at IS NULL AND sl.is_active
        WHERE s.operating_company_id = $1::uuid AND s.source_document_ref IS NOT NULL AND s.voided_at IS NULL
        GROUP BY s.driver_id, d.first_name, d.last_name
        ORDER BY 2`, [USMCA])).rows;
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  p.push(...liveProblems(rows));
  const disagree = rows.filter((r) => new Set((r.rates ?? []).map(Number)).size > 1);
  for (const r of disagree) console.log(`${LABEL} LISTED (settlements disagree, owner: list only): ${r.driver} card ${r.card ?? "none"}c, rates ${[...new Set(r.rates.map(Number))].join("/")}c on ${r.setl_nos}`);
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — ${rows.length} Creator drivers; ${disagree.length} listed (settlements disagree); every other card = its settlement rate`);
}
