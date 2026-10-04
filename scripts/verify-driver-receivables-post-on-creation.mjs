#!/usr/bin/env node
/**
 * verify-driver-receivables-post-on-creation — ROUND 394 RULING 2, step 2, CC-1.
 *
 * Accident damage and civil / internal fines are DRIVER RECEIVABLES. Each posts on creation (Dr 1255 / 1256,
 * Cr the matching recovery account), is recovered through settlement (Cr the receivable), and is written off
 * only by a reversing entry — never by zeroing a stored balance.
 *
 * STATIC:
 *   RULE 1 — the posting engine knows source 'driver_liability' and its builder resolves BOTH sides by role
 *            through driver-receivable-roles.ts (accident_damage -> driver_damage_receivable / damage_recovery;
 *            civil_fine -> driver_fine_receivable / civil_fines_expense; internal_fine -> driver_fine_receivable /
 *            other_recovery).
 *   RULE 2 — the three creators (accident spawn-liability, civil fine convert, internal fine) post the
 *            receivable in their transaction and pass liabilityId to the deduction.
 *   RULE 3 — pay-run close and settlement-line materialization credit the receivable for a deduction that
 *            names its liability.
 *   RULE 4 — void (route + governance executor) writes off through writeOffDriverReceivableInClientTx (reversing
 *            entry); mark-paid-off refuses a receivable; escrow forfeit credits the receivable.
 *   RULE 5 — migration 202615390100 adds driver_settlement_deductions.liability_id with its FK.
 * LIVE (direct, read-only, USMCA only):
 *   RULE 6 — every damage / fine liability created on or after SINCE has its 'driver_liability' posting, and
 *            every one of those voided since has a reversal.
 * --selftest exercises every rule.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-receivables-post-on-creation";
export const SINCE = "2026-10-06";
export const REQUIRES_LIVE_DB = "driver receivables are live money — fails closed without a database";
const SRC = "apps/backend/src";
export const F = {
  roles: `${SRC}/driver-finance/driver-receivable-roles.ts`,
  engine: `${SRC}/accounting/posting-engine.service.ts`,
  accident: `${SRC}/safety/safety.routes.ts`,
  civil: `${SRC}/safety/fines.routes.ts`,
  internal: `${SRC}/safety/safety-v5.routes.ts`,
  payrun: `${SRC}/driver-finance/settlement-payrun-close.service.ts`,
  materialize: `${SRC}/driver-finance/settlement-lines-materialize.service.ts`,
  liabRoutes: `${SRC}/liabilities/liabilities.routes.ts`,
  governance: `${SRC}/governance/void-cancel-executors.ts`,
  forfeit: `${SRC}/driver-finance/escrow-forfeit.service.ts`,
  migration: "db/migrations/202615390100_settlement_deduction_links_its_driver_receivable.sql",
};

export function staticProblems(read) {
  const out = [];
  const r = read(F.roles) ?? "";
  for (const [t, rec, cr] of [
    ["accident_damage", "driver_damage_receivable", "damage_recovery"],
    ["civil_fine", "driver_fine_receivable", "civil_fines_expense"],
    ["internal_fine", "driver_fine_receivable", "other_recovery"],
  ]) {
    if (!new RegExp(`${t}: \\{ receivable: "${rec}", credit: "${cr}" \\}`).test(r)) out.push(`RULE 1 ${t} is not mapped to ${rec} / ${cr}`);
  }
  const e = read(F.engine) ?? "";
  if (!/"driver_liability",\s*\n\] as const;/.test(e)) out.push("RULE 1 POSTING_SOURCE_TYPES has no 'driver_liability'");
  if (!/sourceType === "driver_liability"\) return buildDriverLiabilityLines\(/.test(e)) out.push("RULE 1 'driver_liability' is not dispatched to its builder");
  const b = e.slice(e.indexOf("async function buildDriverLiabilityLines("), e.indexOf("async function buildDriverLiabilityLines(") + 4000);
  if (!/driverReceivableFor\(/.test(b) || (b.match(/resolveRoleAccountOptional\(/g) ?? []).length < 2) out.push("RULE 1 the builder does not resolve both sides by role through driverReceivableFor");
  for (const [k, ded] of [["accident", "damage"], ["civil", "fine"], ["internal", "fine"]]) {
    const s = read(F[k]) ?? "";
    if (!/postSourceTransactionInClientTx\([\s\S]{0,240}source_transaction_type: "driver_liability"/.test(s)) out.push(`RULE 2 ${F[k]} does not post the receivable at creation`);
    if (!new RegExp(`sourceType: "${ded}",\\s*liabilityId`).test(s)) out.push(`RULE 2 ${F[k]} does not pass liabilityId to its ${ded} deduction`);
  }
  if (!/driverReceivableFor\(r\.liability_type\)\?\.receivable \?\? bucketRecoveryRoleKey/.test(read(F.payrun) ?? "")) out.push("RULE 3 pay-run close does not credit the receivable for a linked deduction");
  if (!/driverReceivableFor\(d\.liability_type\)/.test(read(F.materialize) ?? "")) out.push("RULE 3 settlement-line materialization does not post a linked deduction to the receivable");
  const lr = read(F.liabRoutes) ?? "";
  if (!/writeOffDriverReceivableInClientTx\(/.test(lr)) out.push("RULE 4 the liability void route does not write off through the reversing entry");
  if (!/driver_receivable_recovers_through_settlement_or_void/.test(lr)) out.push("RULE 4 mark-paid-off does not refuse a driver receivable");
  if (!/writeOffDriverReceivableInClientTx\(/.test(read(F.governance) ?? "")) out.push("RULE 4 the governance void executor does not write off through the reversing entry");
  if (!/receivable\?\.receivable \?\? "damage_recovery"/.test(read(F.forfeit) ?? "")) out.push("RULE 4 escrow forfeit does not credit a linked receivable");
  const m = read(F.migration);
  if (!m || !/ADD COLUMN IF NOT EXISTS liability_id uuid/.test(m) || !/REFERENCES driver_finance\.driver_liabilities\(id\)/.test(m)) out.push(`RULE 5 ${F.migration} does not add liability_id with its FK`);
  return out;
}

export function liveProblems(m) {
  const out = [];
  if (m.unposted > 0) out.push(`RULE 6 ${m.unposted} USMCA damage / fine liability(ies) created since ${SINCE} with no 'driver_liability' posting`);
  if (m.voidedUnreversed > 0) out.push(`RULE 6 ${m.voidedUnreversed} voided USMCA damage / fine liability(ies) whose posting was never reversed`);
  return out;
}

export function run() {
  return staticProblems((f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null));
}

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const real = (f) => (existsSync(join(ROOT, f)) ? readFileSync(join(ROOT, f), "utf8") : null);
    const plant = (file, from, to) => (f) => (f === file ? (real(f) ?? "").replace(from, to) : real(f));
    const has = (reader, rule) => staticProblems(reader).some((x) => x.startsWith(rule));
    const cases = [
      ["the shipped tree passes", staticProblems(real).length === 0],
      ["a fine mapped to a guessed credit fails", has(plant(F.roles, 'credit: "civil_fines_expense"', 'credit: "other_recovery"'), "RULE 1")],
      ["the accident path without its posting fails", has(plant(F.accident, 'source_transaction_type: "driver_liability"', 'source_transaction_type: "none"'), "RULE 2")],
      ["an internal fine deduction without its liability fails", has(plant(F.internal, 'sourceType: "fine",\n              liabilityId,', 'sourceType: "fine",'), "RULE 2")],
      ["pay-run close crediting the recovery account fails", has(plant(F.payrun, "driverReceivableFor(r.liability_type)?.receivable ?? bucketRecoveryRoleKey", "bucketRecoveryRoleKey"), "RULE 3")],
      ["mark-paid-off zeroing a receivable fails", has(plant(F.liabRoutes, "driver_receivable_recovers_through_settlement_or_void", "x"), "RULE 4")],
      ["a forfeit crediting damage_recovery fails", has(plant(F.forfeit, 'receivable?.receivable ?? "damage_recovery"', '"damage_recovery"'), "RULE 4")],
      ["a missing migration fails", has((f) => (f === F.migration ? null : real(f)), "RULE 5")],
      ["live clean passes", liveProblems({ unposted: 0, voidedUnreversed: 0 }).length === 0],
      ["an unposted receivable fails", liveProblems({ unposted: 1, voidedUnreversed: 0 }).some((x) => x.startsWith("RULE 6"))],
      ["a voided receivable never reversed fails", liveProblems({ unposted: 0, voidedUnreversed: 1 }).some((x) => x.startsWith("RULE 6"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN READ ONLY");
    await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
    const usmca = `(SELECT id FROM org.companies WHERE code = 'USMCA')`;
    const posted = `EXISTS (SELECT 1 FROM accounting.journal_entry_postings p WHERE p.source_transaction_type = 'driver_liability' AND p.source_transaction_id = l.id::text AND p.reversal_of_line_id IS NULL)`;
    const reversed = `EXISTS (SELECT 1 FROM accounting.journal_entry_postings o JOIN accounting.journal_entry_postings r ON r.reversal_of_line_id = o.id
                       WHERE o.source_transaction_type = 'driver_liability' AND o.source_transaction_id = l.id::text)`;
    const base = `FROM driver_finance.driver_liabilities l WHERE l.operating_company_id = ${usmca} AND l.type IN ('accident_damage', 'civil_fine', 'internal_fine') AND l.created_at >= $1::date`;
    const unposted = (await client.query(`SELECT count(*)::int n ${base} AND l.voided_at IS NULL AND NOT ${posted}`, [SINCE])).rows[0].n;
    const voidedUnreversed = (await client.query(`SELECT count(*)::int n ${base} AND l.voided_at IS NOT NULL AND ${posted} AND NOT ${reversed}`, [SINCE])).rows[0].n;
    const total = (await client.query(`SELECT count(*)::int n FROM driver_finance.driver_liabilities l WHERE l.operating_company_id = ${usmca} AND l.type IN ('accident_damage', 'civil_fine', 'internal_fine')`)).rows[0].n;
    await client.query("ROLLBACK");
    problems.push(...liveProblems({ unposted, voidedUnreversed }));
    if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
    else console.log(`${LABEL}: OK — static rules 1-5 hold; every USMCA damage / fine liability since ${SINCE} is posted, every voided one reversed (USMCA damage / fine liabilities in total: ${total}).`);
  } finally {
    client.release?.();
    await pool?.end?.();
  }
}
