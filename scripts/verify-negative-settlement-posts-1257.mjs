#!/usr/bin/env node
/**
 * verify-negative-settlement-posts-1257 — ROUND 389.3 RULING 1, CC-1.
 *
 * A settlement whose deductions exceed its earnings is not refused: net pay floors at $0.00 and the shortfall posts
 * Dr 1257 driver_negative_settlement_receivable (by role), the driver on the line and the settlement as the entry's source.
 * STATIC: RULE 1 pay-run close no longer throws NET_PAY_NEGATIVE, floors net at 0 and resolves the 1257 role;
 *         RULE 2 the A/P chain applies only what the bills hold and posts the excess Dr 1257, tied to the shortfall.
 * LIVE (--live, USMCA): RULE 3 no closed settlement with net_pay < 0; RULE 4 GL 1257 (debit balance) = sum of the
 *         negative-settlement lines posted (and, once recovery lands, net of their recoveries) — reported.
 * --selftest fails on a planted negative-net refusal and on a chain that over-applies A/P.
 */
import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-negative-settlement-posts-1257";
const F = { close: "apps/backend/src/driver-finance/settlement-payrun-close.service.ts", chain: "apps/backend/src/driver-finance/settlement-ap-chain.service.ts" };

export function staticProblems(read) {
  const out = [];
  const c = read(F.close) ?? "";
  if (/throw new SettlementPayRunError\(\s*"NET_PAY_NEGATIVE"/.test(c)) out.push("RULE 1 pay-run close still refuses a negative net");
  if (!/resolvePayRunRoleAccount\(client, opco, "driver_negative_settlement_receivable"\)/.test(c) || !/netCents = 0;/.test(c)) out.push("RULE 1 pay-run close does not floor net at 0 and resolve the 1257 role");
  const a = read(F.chain) ?? "";
  if (!/Math\.min\(app\.cents, capacity\)/.test(a) || !/SHORTFALL_DOES_NOT_TIE/.test(a) || !/account_id: input\.shortfallAccountId, debit_or_credit: "debit"/.test(a)) out.push("RULE 2 the A/P chain does not post the excess Dr 1257 tied to the shortfall");
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
    const cases = [
      ["the shipped tree passes", staticProblems(real).length === 0],
      ["a planted negative-net refusal fails", staticProblems((f) => (f === F.close ? (real(f) ?? "") + '\nthrow new SettlementPayRunError(\n "NET_PAY_NEGATIVE", "x");' : real(f))).some((x) => x.startsWith("RULE 1"))],
      ["a chain that over-applies A/P fails", staticProblems(plant(F.chain, "Math.min(app.cents, capacity)", "app.cents")).some((x) => x.startsWith("RULE 2"))],
    ];
    for (const [n, ok] of cases) console.log(`  ${ok ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, ok]) => !ok).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const problems = run();
  if (process.argv.includes("--live")) {
    const { requireLiveDbOrExit } = await import("./lib/require-live-db.mjs");
    const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
    try {
      await client.query("BEGIN READ ONLY");
      await client.query("SELECT set_config('app.bypass_rls', 'lucia', true)");
      const usmca = `(SELECT id FROM org.companies WHERE code = 'USMCA')`;
      const neg = (await client.query(`SELECT count(*)::int n FROM driver_finance.driver_settlements WHERE operating_company_id = ${usmca} AND net_pay < 0 AND status IN ('closed', 'paid', 'locked')`)).rows[0].n;
      const gl = (await client.query(`SELECT COALESCE(sum(CASE p.debit_or_credit WHEN 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint AS n
          FROM accounting.journal_entry_postings p JOIN accounting.chart_of_accounts_roles r ON r.account_id = p.account_id AND r.operating_company_id = p.operating_company_id
         WHERE r.role = 'driver_negative_settlement_receivable' AND r.is_active AND p.operating_company_id = ${usmca}`)).rows[0].n;
      await client.query("ROLLBACK");
      console.log(`${LABEL}: live — closed USMCA settlements with negative net: ${neg}; GL 1257 balance ${gl} cents`);
      if (neg > 0) problems.push(`RULE 3 ${neg} closed settlement(s) carry a negative net`);
    } finally {
      client.release?.();
      await pool?.end?.();
    }
  }
  if (problems.length) { console.error(`${LABEL}: FAIL\n  ${problems.join("\n  ")}`); process.exitCode = 1; }
  else console.log(`${LABEL}: OK — negative net floors at 0 and posts Dr 1257; the A/P chain never over-applies.`);
}
