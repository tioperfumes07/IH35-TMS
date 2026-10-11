#!/usr/bin/env node
/**
 * GUARD — LEAD RULING 443.44 Ask B (CC-3): a salaried week has no per-load driver bill.
 *   RULE 1 (static) — void-stray-salaried-driver-bill.service.ts refuses unless the bill is OPEN, never settled, on a
 *          Salaried 0-rate override load, with no live settlement line, no A/P-chain gl_bills row and no journal posting,
 *          and a real reason (>= 20 chars); it VOIDS (UPDATE status 'void' + voided_at) — never DELETE — and audits.
 *   RULE 2 (live) — 0 live (non-void, > $0) driver bills on Salaried-override loads in USMCA, except the named, shrink-only
 *          set below (bills minted by the pre-#26317 delivery-path bug, each to be voided through RULE 1's path).
 * Run: node scripts/verify-settlement-creator-salaried-stray-bill-void.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "a stray salaried driver bill is live money — fails closed without a database";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-settlement-creator-salaried-stray-bill-void";
const SVC = "apps/backend/src/driver-finance/void-stray-salaried-driver-bill.service.ts";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
/** Shrink-only. Was {2d48d11e} (5816 / load 13595, $169.65) — voided on prod 2026-10-11 through the Ask B route. */
export const KNOWN_STRAY = new Set([]);

export function staticProblems(src) {
  const p = [];
  if (!/reason\.length < 20/.test(src)) p.push("RULE 1 a reason shorter than 20 chars is not refused");
  if (!/bill\.status !== "open"/.test(src)) p.push("RULE 1 a non-open bill is not refused");
  if (!/bill\.settled_in_settlement_id\) throw/.test(src)) p.push("RULE 1 a settled bill is not refused");
  if (!/Number\(bill\.rate\) === 0 && \/\^\(salaried\|local driver — weekly salary\)\/i\.test/.test(src)) p.push("RULE 1 the Salaried 0-rate override is not required");
  if (!/Number\(links\.lines\) > 0\) throw/.test(src)) p.push("RULE 1 a bill with live settlement lines is not refused");
  if (!/Number\(links\.gl_bills\) > 0\) throw/.test(src)) p.push("RULE 1 a bill on an A/P-chain run is not refused");
  if (!/Number\(links\.postings\) > 0\) throw/.test(src)) p.push("RULE 1 a bill with journal postings is not refused");
  if (!/SET status = 'void', voided_at = now\(\), void_reason = \$2, voided_by_user_id/.test(src)) p.push("RULE 1 the bill is not voided (void-not-delete)");
  if (/DELETE FROM driver_finance\.driver_bills/i.test(src)) p.push("RULE 1 the path DELETEs a driver bill");
  if (!/driver_finance\.driver_bill\.voided_stray_salaried/.test(src)) p.push("RULE 1 the void is not audited");
  return p;
}

export function liveProblems(rows) {
  return rows.filter((r) => !KNOWN_STRAY.has(r.id)).map((r) => `RULE 2 live driver bill ${r.id} ($${(Number(r.cents) / 100).toFixed(2)}) on Salaried load ${r.load_number}`);
}

function selftest() {
  const good = fs.readFileSync(path.join(ROOT, SVC), "utf8");
  const bad = [];
  if (staticProblems(good).length) bad.push(`real tree flagged: ${staticProblems(good).join("; ")}`);
  const plants = [
    (s) => s.replace('bill.status !== "open"', 'bill.status === "x"'),
    (s) => s.replace("if (bill.settled_in_settlement_id) throw", "if (false) throw"),
    (s) => s.replace("Number(links.postings) > 0) throw", "Number(links.postings) > 99) throw"),
    (s) => s.replace("SET status = 'void', voided_at = now(), void_reason = $2, voided_by_user_id", "SET status = 'open'"),
    (s) => s + "\n// DELETE FROM driver_finance.driver_bills WHERE id = $1",
    (s) => s.replace("reason.length < 20", "reason.length < 1"),
  ];
  for (const f of plants) {
    const pl = f(good);
    if (pl === good) bad.push(`plant did not apply: ${f.toString().slice(0, 70)}`);
    else if (!staticProblems(pl).length) bad.push(`plant passed: ${f.toString().slice(0, 70)}`);
  }
  if (!liveProblems([{ id: "2d48d11e-4288-4fb1-aaad-b112c54c1f0b", cents: 16965, load_number: "13595" }]).length) bad.push("a voided-and-removed stray bill coming back live passes");
  if (!liveProblems([{ id: "00000000-0000-0000-0000-000000000001", cents: 100, load_number: "1" }]).length) bad.push("a new stray bill passes");
  if (bad.length) { console.error(`${LABEL} selftest FAIL\n- ${bad.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} selftest PASS (${plants.length} plants + 2 live fixtures)`);
}

if (process.argv.includes("--selftest")) selftest();
else {
  const p = staticProblems(fs.readFileSync(path.join(ROOT, SVC), "utf8"));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let rows = [];
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    rows = (await client.query(
      `SELECT db.id::text, db.gross_amount_cents::text AS cents, l.load_number
         FROM driver_finance.driver_bills db JOIN mdata.loads l ON l.id = db.load_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL AND db.status <> 'void' AND COALESCE(db.gross_amount_cents, 0) > 0
          AND l.driver_pay_rate_per_mile = 0 AND l.driver_pay_rate_override_reason ~* '^(salaried|local driver — weekly salary)'`,
      [USMCA],
    )).rows;
    await client.query("ROLLBACK");
  } finally {
    client.release?.(); await pool?.end?.();
  }
  p.push(...liveProblems(rows));
  if (p.length) { console.error(`${LABEL} FAIL\n- ${p.join("\n- ")}`); process.exit(1); }
  console.log(`${LABEL} PASS — ${rows.length} live bill(s) on Salaried loads, all named (${[...KNOWN_STRAY].length} shrink-only)`);
}
