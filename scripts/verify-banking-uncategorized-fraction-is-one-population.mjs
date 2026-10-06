#!/usr/bin/env node
/**
 * BANK-F430 — BOTH HALVES OF THE UNCATEGORIZED FRACTION MUST COUNT THE SAME POPULATION.
 *
 * Banking Home renders one sentence built from two different queries:
 *
 *     "989 of 1011 transactions"
 *      ^ countUncategorizedTransactions      ^ countTotalBankTransactions
 *
 * The numerator excludes voided rows (pendingCategorizationPredicate -> voided_at IS NULL, added by
 * BANK-F30016 for exactly this reason). The denominator did not. So the gap between the two numbers
 * was not finished work — it was voided rows the register never lists. Measured on prod USMCA
 * 2026-10-05 under bypass_rls: 789 pending_categorization + 200 uncategorized live = the 989
 * numerator; 22 pending_categorization rows with voided_at IS NOT NULL = the entire 1011 - 989 gap;
 * and ZERO rows with status='categorized'. The owner read the tile as "22 are done", went looking for
 * those 22, and found nothing — because not one transaction had ever been categorized.
 *
 * Nothing threw. Both counts were correct about their own population. That is why this needs a guard
 * and not a test: the failure is a fraction whose halves disagree about what they are counting.
 *
 *   RULE 1 — countTotalBankTransactions must exclude voided rows (voided_at IS NULL) on its default
 *            path, because the numerator does and because the register this count mirrors
 *            (/api/v1/banking/plaid/company-transactions) does.
 *   RULE 2 — it must keep excluding is_sample_data on the default path (GO-19-02).
 *   RULE 3 — the includeSampleData=true reveal path must stay a reveal: it may lift both filters, but
 *            the default path must never be the one that reveals.
 *   RULE 4 — the numerator predicate must still carry voided_at IS NULL. If a future edit drops it
 *            there, the fraction breaks the other way and this guard must fail too.
 *   RULE 5 — the KPI route must feed the caption from these two functions, not from
 *            views.banking_account_tiles.uncategorized_count (BANKING-1 regression: that view counts
 *            only status='uncategorized' and read 0 against a four-figure queue).
 *
 * --selftest proves each rule can FAIL. A proof command that cannot fail is worse than no proof.
 */
import { readFileSync, existsSync } from "node:fs";

const NAME = "verify-banking-uncategorized-fraction-is-one-population";
const PENDING = "apps/backend/src/banking/pending-categorization.ts";
const ROUTES = "apps/backend/src/banking/banking.routes.ts";

const read = (p) => (existsSync(p) ? readFileSync(p, "utf8") : null);

// The body of countTotalBankTransactions, from its signature to the closing of its template SQL.
function totalFn(src) {
  const i = src.indexOf("export async function countTotalBankTransactions");
  if (i < 0) return "";
  const end = src.indexOf("\n}", i);
  return src.slice(i, end < 0 ? i + 1200 : end + 2);
}

// Bounded at the function's own closing brace: a window that bleeds into the next function would
// read ITS voided_at filter and pass a numerator that had dropped one. (Caught by selftest case 5.)
function predicateFn(src) {
  const i = src.indexOf("export function pendingCategorizationPredicate");
  if (i < 0) return "";
  const end = src.indexOf("\n}", i);
  return src.slice(i, end < 0 ? i + 600 : end + 2);
}

function run({ pending, routes }) {
  const out = [];
  if (pending === null) return [`RULE 1: ${PENDING} is missing.`];

  const total = totalFn(pending);
  if (!total) {
    out.push("RULE 1: countTotalBankTransactions is gone — the caption's denominator has no single source.");
  } else {
    // The default (non-reveal) branch of the ternary is what the KPI uses.
    const defaultBranch = /includeSampleData \? "" : "([^"]*)"/.exec(total)?.[1] ?? "";
    if (!/voided_at IS NULL/.test(defaultBranch)) {
      out.push("RULE 1: countTotalBankTransactions does not exclude voided rows on its default path. The numerator does, so the gap between the two numbers reads as categorized work that does not exist (live USMCA: all 22 of the 1011-989 gap were voided).");
    }
    if (!/is_sample_data = false/.test(defaultBranch)) {
      out.push("RULE 2: countTotalBankTransactions no longer excludes is_sample_data on its default path (GO-19-02).");
    }
    if (/includeSampleData \? "[^"]*voided_at IS NULL[^"]*" : ""/.test(total)) {
      out.push("RULE 3: the filters are inverted — the reveal path filters and the default path does not.");
    }
  }

  const pred = predicateFn(pending);
  if (!pred) {
    out.push("RULE 4: pendingCategorizationPredicate is gone — the numerator has no single source.");
  } else if (!/voided_at IS NULL/.test(pred)) {
    out.push("RULE 4: pendingCategorizationPredicate no longer excludes voided rows (BANK-F30016). The fraction is broken from the numerator side.");
  }

  if (routes !== null) {
    const i = routes.indexOf("/api/v1/banking/dashboard/kpis");
    const kpi = i < 0 ? "" : routes.slice(i, i + 6000);
    if (!kpi) {
      out.push("RULE 5: the KPI route is gone.");
    } else {
      if (!/countUncategorizedTransactions\(/.test(kpi) || !/countTotalBankTransactions\(/.test(kpi)) {
        out.push("RULE 5: the KPI route no longer builds the caption from the two shared counts.");
      }
      if (/total_uncategorized:\s*[^,\n]*uncategorized_count/.test(kpi)) {
        out.push("RULE 5: total_uncategorized is being served from views.banking_account_tiles.uncategorized_count again — that view counts only status='uncategorized' (BANKING-1: it read 0 against a four-figure queue).");
      }
    }
  }
  return out;
}

if (process.argv.includes("--selftest")) {
  const goodTotal = `export async function countTotalBankTransactions(
  client, operatingCompanyId, includeSampleData = false) {
  const res = await client.query(\`
      SELECT count(*)::int AS count
      FROM banking.bank_transactions bt
      WHERE bt.operating_company_id = $1::uuid
        \${includeSampleData ? "" : "AND bt.voided_at IS NULL AND bt.is_sample_data = false"}
    \`, [operatingCompanyId]);
  return Number(res.rows[0]?.count ?? 0);
}`;
  const goodPred = `export function pendingCategorizationPredicate(alias = "bt") {
  return \`((\${alias}.status = 'pending_categorization' OR \${alias}.status = 'uncategorized') AND \${alias}.voided_at IS NULL)\`;
}`;
  const goodPending = goodPred + "\n" + goodTotal;
  const goodRoutes = `app.get("/api/v1/banking/dashboard/kpis", async () => {
    const uncategorizedCount = await countUncategorizedTransactions(client, companyId);
    const totalTransactions = await countTotalBankTransactions(client, companyId);
    return { total_uncategorized: uncategorizedCount, total_transactions: totalTransactions };
  });`;

  const cases = [
    ["a clean tree passes", { pending: goodPending, routes: goodRoutes }, 0],
    ["rule 1 catches the denominator counting voided rows (the shipped defect)",
      { pending: goodPending.replace('"AND bt.voided_at IS NULL AND bt.is_sample_data = false"', '"AND bt.is_sample_data = false"'), routes: goodRoutes }, 1],
    ["rule 2 catches the sample-data filter being dropped",
      { pending: goodPending.replace('"AND bt.voided_at IS NULL AND bt.is_sample_data = false"', '"AND bt.voided_at IS NULL"'), routes: goodRoutes }, 1],
    ["rule 3 catches the filters being inverted onto the reveal path",
      { pending: goodPending.replace('includeSampleData ? "" : "AND bt.voided_at IS NULL AND bt.is_sample_data = false"', 'includeSampleData ? "AND bt.voided_at IS NULL" : ""'), routes: goodRoutes }, 3],
    ["rule 4 catches the numerator dropping voided_at",
      { pending: goodPred.replace(" AND ${alias}.voided_at IS NULL", "") + "\n" + goodTotal, routes: goodRoutes }, 1],
    ["rule 5 catches the caption leaving the shared counts",
      { pending: goodPending, routes: goodRoutes.replace("await countTotalBankTransactions(client, companyId)", "0") }, 1],
    ["rule 5 catches a return to the tile view's uncategorized_count",
      { pending: goodPending, routes: goodRoutes.replace("total_uncategorized: uncategorizedCount", "total_uncategorized: row.uncategorized_count") }, 1],
    ["a missing source file fails rather than passing silently",
      { pending: null, routes: goodRoutes }, 1],
  ];

  let ok = 0;
  for (const [label, src, expected] of cases) {
    const got = run(src).length;
    if (got === expected) ok += 1;
    else console.error(`${NAME} SELFTEST FAIL — ${label}: expected ${expected}, got ${got}`);
  }
  console.log(`${NAME} SELFTEST ${ok === cases.length ? "OK" : "FAILED"} — ${ok}/${cases.length}`);
  process.exit(ok === cases.length ? 0 : 1);
}

const failures = run({ pending: read(PENDING), routes: read(ROUTES) });
if (failures.length > 0) {
  for (const f of failures) console.error(`${NAME}: ${f}`);
  console.error(`${NAME}: FAIL — ${failures.length} rule(s) broken.`);
  process.exit(1);
}
console.log(`${NAME}: PASS — the UNCATEGORIZED caption's numerator and denominator count one population (live, not voided, not sample), both from the shared counts.`);
