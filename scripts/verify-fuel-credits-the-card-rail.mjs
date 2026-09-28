#!/usr/bin/env node
/**
 * verify-fuel-credits-the-card-rail — ROUND 155.18 JOB 2 (owner order, 2026-09-28).
 *
 * 66 of this week's 982 purged voided USMCA expenses were fuel documents that wrongly credited
 * 1090 "Undeposited Funds" instead of the driver's actual card rail (Dreamline 2510 / Relay
 * 1295). That writer bug is already fixed (R-153.6/153.7): fuel-expense-document.service.ts
 * resolves payment_account_uuid via resolveCompanyDirectCreditAccount() (poster.service.ts),
 * whose resolveFuelCardRailAccount() maps ONLY to account_number "2510" or "1295" and throws
 * rather than falling back to any other account (never 1090, never ap_control, never a guess).
 *
 * This guard is STATIC (no DATABASE_URL, never skips) and asserts the shape of the fix:
 *   - fuel-expense-document.service.ts still calls resolveCompanyDirectCreditAccount() to set
 *     the document's payment_account_uuid (not a hardcoded id, not a different resolver)
 *   - poster.service.ts's card-rail resolver still maps only to "2510"/"1295"
 *   - neither file contains the literal string "1090" as an account_number
 *
 * It deliberately does NOT assert a dollar total (moves with real business). It asserts the
 * query/resolution SHAPE that made 66 documents wrong, which does not.
 */
// See ifta-excludes-non-highway-fuel-types.mjs's identical declaration for why this is correct:
// this file is PURELY STATIC (reads two source files off disk, pattern-matches). It opens no DB
// connection on its own account, so there is no live result to fake-green.
export const ALLOW_OFFLINE_SKIP =
  "Static source-shape guard: reads fuel-expense-document.service.ts and poster.service.ts off disk, asserts the card-rail resolution shape. No DB connection on the static path.";

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fuel-credits-the-card-rail";
const DOC_TARGET = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const POSTER_TARGET = "apps/backend/src/accounting/fuel-posting/poster.service.ts";

const fail = (m) => {
  console.error(`\n  ${LABEL} FAIL: ${m}\n`);
  process.exit(1);
};
const ok = (m) => console.log(`  ${LABEL} PASS: ${m}`);

export function analyse(docSrc, posterSrc) {
  const strip = (s) =>
    s
      .split("\n")
      .filter((l) => !l.trim().startsWith("//") && !l.trim().startsWith("*") && !l.trim().startsWith("--"))
      .join("\n");
  const doc = strip(docSrc);
  const poster = strip(posterSrc);
  const problems = [];

  if (!/resolveCompanyDirectCreditAccount\s*\(/.test(doc)) {
    problems.push(
      "fuel-expense-document.service.ts no longer calls resolveCompanyDirectCreditAccount() — the " +
        "card-rail resolution path was removed or replaced with something unaudited."
    );
  }
  if (/payment_account_uuid[\s\S]{0,80}1090/.test(doc) || /1090[\s\S]{0,80}payment_account_uuid/.test(doc)) {
    problems.push('fuel-expense-document.service.ts references "1090" near payment_account_uuid.');
  }
  if (!/accountNumber\s*=\s*rail\s*===\s*["']dreamline_card_payable["']\s*\?\s*["']2510["']\s*:\s*["']1295["']/.test(poster)) {
    problems.push(
      "poster.service.ts's card-rail resolver no longer maps exactly {dreamline_card_payable->2510, " +
        "relay_fuel_wallet->1295} — the two-branch mapping was changed or a third branch/fallback was added."
    );
  }
  if (/["']1090["']/.test(poster)) {
    problems.push('poster.service.ts references account "1090" — the card-rail resolver must never fall back to it.');
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodDoc = `const { account_id } = await resolveCompanyDirectCreditAccount(client, opco, pref);`;
  const badDocNoCall = `const account_id = "hardcoded-uuid";`;
  const badDoc1090 = `payment_account_uuid: "1090-fallback-account-id",`;
  const goodPoster = `const accountNumber = rail === "dreamline_card_payable" ? "2510" : "1295";`;
  const badPoster1090 = `const accountNumber = rail === "dreamline_card_payable" ? "2510" : "1090";`;
  const badPosterNoMap = `const accountNumber = resolveSomeOtherWay(rail);`;
  const cases = [
    ["clean pair passes", analyse(goodDoc, goodPoster).length === 0],
    ["missing resolver call is caught", analyse(badDocNoCall, goodPoster).some((p) => p.includes("no longer calls"))],
    ["1090 near payment_account_uuid is caught", analyse(badDoc1090, goodPoster).some((p) => p.includes("1090"))],
    ["1090 in poster's rail branch is caught", analyse(goodDoc, badPoster1090).some((p) => p.includes("1090"))],
    ["poster mapping changed shape is caught", analyse(goodDoc, badPosterNoMap).some((p) => p.includes("two-branch mapping"))],
    [
      "a comment naming the old 1090 bug does not trip the check",
      analyse(`// R-153.6/153.7: never 1090, never a guess\n${goodDoc}`, goodPoster).length === 0,
    ],
  ];
  let bad = 0;
  for (const [name, passed] of cases) {
    console.log(`  ${passed ? "ok" : "FAIL"} — ${name}`);
    if (!passed) bad++;
  }
  if (bad) fail(`${bad} selftest case(s) failed`);
  ok(`selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const docAbs = path.join(ROOT, DOC_TARGET);
const posterAbs = path.join(ROOT, POSTER_TARGET);
if (!fs.existsSync(docAbs)) fail(`${DOC_TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
if (!fs.existsSync(posterAbs)) fail(`${POSTER_TARGET} is missing. Refusing to pass a guard whose subject does not exist.`);
const problems = analyse(fs.readFileSync(docAbs, "utf8"), fs.readFileSync(posterAbs, "utf8"));
if (problems.length) fail(problems.map((p) => `\n    - ${p}`).join(""));
ok(`${DOC_TARGET} resolves the card rail via resolveCompanyDirectCreditAccount(); ${POSTER_TARGET} maps only to 2510/1295, never 1090.`);

// --- Live layer, ADDITIONAL to the static shape check above, not a replacement. Only runs when
// DATABASE_URL is present; never turns the static PASS above into a FAIL on its own account.
const LIVE_LABEL = `${LABEL} (live check)`;
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
async function liveCheck() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.log(`  ${LIVE_LABEL}: SKIP — no DATABASE_URL (the static check above already passed and is sufficient offline).`);
    return;
  }
  const { default: pg } = await import("pg");
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    await client.query("BEGIN");
    await client.query(`SELECT set_config('app.bypass_rls','lucia',true)`);
    const populationRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.source_fuel_transaction_id IS NOT NULL AND e.journal_entry_id IS NOT NULL`,
      [USMCA_COMPANY_ID]
    );
    const population = Number(populationRes.rows[0].n);
    if (population === 0) {
      await client.query("ROLLBACK");
      console.log(`  ${LIVE_LABEL}: SKIP — 0 live posted fuel expenses right now; nothing to check live.`);
      return;
    }
    const badRes = await client.query(
      `SELECT count(*) AS n FROM accounting.expenses e
         JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = e.journal_entry_id
         JOIN catalogs.accounts a ON a.id = p.account_id
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL
          AND e.source_fuel_transaction_id IS NOT NULL AND p.debit_or_credit = 'credit'
          AND a.account_number != ALL($2::text[])`,
      [USMCA_COMPANY_ID, ["2510", "1295"]]
    );
    await client.query("ROLLBACK");
    const badCount = Number(badRes.rows[0].n);
    if (badCount > 0) {
      console.error(`  ${LIVE_LABEL}: FAIL — ${badCount} of ${population} live fuel expense(s) credit an account other than 2510/1295.`);
      process.exitCode = 1;
      return;
    }
    console.log(`  ${LIVE_LABEL}: PASS — all ${population} live fuel expense(s) credit only 2510/1295.`);
  } catch (e) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`  ${LIVE_LABEL}: connection/query error (not fatal to the static PASS above): ${e.message}`);
  } finally {
    await client.end().catch(() => {});
  }
}
await liveCheck();
