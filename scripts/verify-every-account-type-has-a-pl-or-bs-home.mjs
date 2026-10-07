#!/usr/bin/env node
/** MATRIX-BUILT-OPTIONAL — live-only / invariant ratchet guard; no surface wiring leaf to register. */
// verify-every-account-type-has-a-pl-or-bs-home.mjs — ROUND 384 (Lead, 2026-10-03).
//
// OWNER: "each account in chart of accounts, sub accounts, expense in profit and loss and income must
// be completely and fully working and done."
//
// Every account type in the chart belongs on exactly ONE statement. If a type belongs to neither, any
// money posted to it is missing from both the P&L and the Balance Sheet — and both still foot, because
// a line that was never added to a total cannot unbalance it. That is the most dangerous shape a
// financial report has: complete-looking and incomplete.
//
// Measured on production 2026-10-03, the chart carries eight types:
//   P&L:            Income, Expense, CostOfGoodsSold, OtherExpense      (OtherIncome mapped, unused)
//   Balance Sheet:  Asset, Liability, Equity
//   Neither:        Statistical — QuickBooks' non-posting type, currently 0 postings
//
// This fails when a type appears in the chart that neither statement claims AND it carries postings.
// A type with no postings is reported and allowed: Statistical exists for quantities and is meant to
// stay off both statements. The moment it carries money, that is a real finding.
//
// READ ONLY. DIRECT endpoint — an empty result from the pooler is MASKED, not empty.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

// --selftest (Devin build order 2026-10-05): live-DB guards cannot be fixture-tested — their inputs
// are rows on Neon. One case MUST pass (live check green, or the canonical no-credential refusal
// when nothing resolves locally) and one MUST fail (dead credential — it must refuse, never green).
if (process.argv.includes("--selftest")) { await selftest_verify_every_account_type_has_a_pl_or_bs_home(); }
async function selftest_verify_every_account_type_has_a_pl_or_bs_home() {
  const { runGuard, reportSelftest, statusOf, outputOf, DEAD_DB_ENV } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const real = runGuard(me);
  const noDb = runGuard(me, { env: DEAD_DB_ENV });
  const refused = /DATABASE_URL (?:is )?(?:not set|unset|required)|credential/.test(outputOf(real));
  reportSelftest("verify_every_account_type_has_a_pl_or_bs_home", [
    { name: "live check green, or canonically refuses with no credential", pass: statusOf(real) === 0 || refused, detail: statusOf(real) === 0 ? undefined : outputOf(real).slice(-300) },
    { name: "refuses on dead credential", pass: statusOf(noDb) !== 0, detail: statusOf(noDb) !== 0 ? undefined : outputOf(noDb).slice(-200) },
  ]);
}


const LABEL = "verify-every-account-type-has-a-pl-or-bs-home";
export const REQUIRES_LIVE_DB = "live-only guard: reads production database (USMCA) and cannot be statically verified; run by money-pr-local-gate with DATABASE_URL";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

// Kept in step with profit-loss.service.ts and balance-sheet.service.ts. Adding a type here without
// adding it to the services is the mistake this guard exists to catch, so the lists are spelled out
// rather than imported — two copies that must agree, where silence used to mean "dropped".
const PL = new Set(["Income", "OtherIncome", "CostOfGoodsSold", "Expense", "OtherExpense"]);
const BS = new Set(["Asset", "Liability", "Equity"]);
const KNOWN_NON_POSTING = new Set(["Statistical"]);

const main = async () => {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  let bad = 0;
  try {
    await client.query("BEGIN READ ONLY");
    await client.query(`SET LOCAL app.bypass_rls = 'lucia'`);
    if ((await client.query(`SELECT current_user AS u`)).rows[0].u === "ih35_app") {
      console.error(`${LABEL}: FAIL — connected as ih35_app (the POOLER). An empty result here would be masked, not empty.`);
      await client.query("ROLLBACK");
      return 1;
    }

    const { rows } = await client.query(
      `SELECT COALESCE(a.account_type, '(null)') AS t,
              count(DISTINCT a.id)::int AS accounts,
              count(DISTINCT a.id) FILTER (WHERE a.parent_account_id IS NOT NULL)::int AS subaccounts,
              count(p.id)::int AS postings
         FROM catalogs.accounts a
         LEFT JOIN accounting.journal_entry_postings p
                ON p.account_id = a.id AND p.operating_company_id = $1
        WHERE a.operating_company_id = $1
        GROUP BY 1
        ORDER BY 2 DESC`,
      [USMCA]
    );

    console.log(`${LABEL} — USMCA\n`);
    console.log("  account_type           statement        accounts  sub-accts  postings");
    for (const r of rows) {
      const home = PL.has(r.t) ? "Profit & Loss" : BS.has(r.t) ? "Balance Sheet" : "NEITHER";
      const flag = home === "NEITHER" && r.postings > 0 ? "  <-- MONEY ON A HOMELESS TYPE" : "";
      if (home === "NEITHER" && r.postings > 0) bad++;
      console.log(
        `  ${String(r.t).padEnd(22)} ${home.padEnd(16)} ${String(r.accounts).padStart(8)} ${String(r.subaccounts).padStart(10)} ${String(r.postings).padStart(9)}${flag}`
      );
      if (home === "NEITHER" && r.postings === 0 && !KNOWN_NON_POSTING.has(r.t)) {
        console.log(`      note: '${r.t}' is on neither statement and is not a declared non-posting type. Harmless while empty; decide its home before it is used.`);
      }
    }
    await client.query("ROLLBACK");
  } finally {
    client.release();
    await pool.end();
  }

  if (bad) {
    console.error(
      `\n${LABEL}: FAIL — ${bad} account type(s) carry postings and appear on NEITHER statement.\n` +
        `Money on those accounts is absent from the P&L and from the Balance Sheet, and BOTH still foot,\n` +
        `because a line never added to a total cannot unbalance it. Give the type a home in\n` +
        `profit-loss.service.ts or balance-sheet.service.ts — and note the P&L now returns an\n` +
        `'unclassified' section (ROUND 384) so such a line is shown rather than dropped in silence.\n`
    );
    return 1;
  }
  console.log(`\n${LABEL}: PASS — every account type carrying postings has a statement.`);
  return 0;
};

main().then((c) => process.exit(c)).catch((e) => { console.error(`${LABEL}: FAIL — ${e.message}`); process.exit(1); });
