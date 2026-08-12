#!/usr/bin/env node
/**
 * CLS-LINKAGE-ONEWAY instance (Expense -> JE, list view) — static ratchet.
 *
 * apps/backend/src/accounting/expenses.routes.ts's expenses LIST query (GET /api/v1/expenses) selected
 * `e.journal_entry_id::text AS journal_entry_id` — a raw FK column — with NO join to
 * accounting.journal_entries at all. accounting.journal_entries has no number/ref/doc column; `memo`
 * IS the JE's human identity (established by #5731/ACCT-F322 and this session's ACCT-F359). The
 * expenses DETAIL route already got this right (joins journal_entries, selects
 * `je.memo AS journal_entry_memo`) — the LIST route never did, so `ExpensesListPage.tsx` hardcoded
 * `entityLabel(null, r.journal_entry_id, "Journal entry")` for every row with a posted JE.
 *
 * INVARIANT (static — no database, runs in every CI context including fresh-DB): the expenses LIST
 * query in expenses.routes.ts must LEFT JOIN accounting.journal_entries and select
 * `je.memo AS journal_entry_memo` alongside `journal_entry_id`.
 *
 * Deliberately a narrow guard scoped to this one query, not a widening of the shared
 * verify-steps/3029-verify-je-payload-carries-label.mjs matcher — that matcher's `<alias>.
 * journal_entry_id::text AS journal_entry_id` shape was tried and reverted because it also matched
 * CTE-chained queries elsewhere it cannot safely reason about (see 3029's own header comment).
 *
 * Self-test: node scripts/verify-expenses-list-je-memo.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-expenses-list-je-memo";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const TARGET = "apps/backend/src/accounting/expenses.routes.ts";

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function stripComments(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "")
    .replace(/^\s*--.*$/gm, "");
}

/**
 * Isolates the expenses LIST query (the block selecting e.id::text AS id and
 * e.journal_entry_id::text AS journal_entry_id, anchored on FROM accounting.expenses e — the LIST
 * query's FROM clause, distinct from the DETAIL query's WHERE e.id = $1 shape) and checks it joins
 * journal_entries + selects je.memo.
 */
export function checkExpensesListQuery(src) {
  const code = stripComments(src);
  const blocks = [...code.matchAll(/`([^`]*)`/g)].map((m) => m[1]);
  const listBlock = blocks.find(
    (b) => /FROM\s+accounting\.expenses\s+e\b/i.test(b) && /e\.journal_entry_id::text\s+AS\s+journal_entry_id/i.test(b)
  );
  if (!listBlock) return { ok: false, reason: "expenses LIST query (FROM accounting.expenses e, selecting journal_entry_id) not found" };

  const joinsJe = /LEFT JOIN\s+accounting\.journal_entries\s+je\s+ON\s+je\.id\s*=\s*e\.journal_entry_id/i.test(listBlock);
  if (!joinsJe) return { ok: false, reason: "expenses LIST query does not LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id" };

  const selectsMemo = /je\.memo\s+AS\s+journal_entry_memo/i.test(listBlock);
  if (!selectsMemo) return { ok: false, reason: "expenses LIST query joins journal_entries but never selects je.memo AS journal_entry_memo" };

  return { ok: true };
}

const isEntryPoint = import.meta.url === `file://${process.argv[1]}`;

if (isEntryPoint && process.argv.includes("--selftest")) {
  const good = `
    const res = await client.query(\`
      SELECT
        e.id::text AS id,
        e.journal_entry_id::text AS journal_entry_id,
        je.memo AS journal_entry_memo
      FROM accounting.expenses e
      LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
      WHERE \${where.join(" AND ")}
    \`);
  `;
  const goodResult = checkExpensesListQuery(good);
  if (!goodResult.ok) fail(`selftest: known-good fixture should pass — ${goodResult.reason}`);

  const regressedNoJoin = `
    const res = await client.query(\`
      SELECT e.id::text AS id, e.journal_entry_id::text AS journal_entry_id
      FROM accounting.expenses e
      WHERE \${where.join(" AND ")}
    \`);
  `;
  const regressedNoJoinResult = checkExpensesListQuery(regressedNoJoin);
  if (regressedNoJoinResult.ok) fail("selftest: regressed fixture (no journal_entries join at all) should FAIL but passed");

  const regressedNoMemo = `
    const res = await client.query(\`
      SELECT e.id::text AS id, e.journal_entry_id::text AS journal_entry_id
      FROM accounting.expenses e
      LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
      WHERE \${where.join(" AND ")}
    \`);
  `;
  const regressedNoMemoResult = checkExpensesListQuery(regressedNoMemo);
  if (regressedNoMemoResult.ok) fail("selftest: regressed fixture (join present, memo not selected) should FAIL but passed");

  const commentTrap = `
    const res = await client.query(\`
      -- TODO: add je.memo AS journal_entry_memo here per CLS-LINKAGE-ONEWAY
      SELECT e.id::text AS id, e.journal_entry_id::text AS journal_entry_id
      FROM accounting.expenses e
      LEFT JOIN accounting.journal_entries je ON je.id = e.journal_entry_id AND je.operating_company_id = e.operating_company_id
      WHERE \${where.join(" AND ")}
    \`);
  `;
  const commentTrapResult = checkExpensesListQuery(commentTrap);
  if (commentTrapResult.ok) fail("selftest: comment-trap fixture (fix mentioned only in a comment) should FAIL but the guard matched its own prose");

  console.log(`[${LABEL}] selftest: PASS — good/regressed(no-join)/regressed(no-memo)/comment-trap fixtures all classify correctly`);
  process.exit(0);
}

if (isEntryPoint) {
  const filePath = path.join(ROOT, TARGET);
  if (!fs.existsSync(filePath)) fail(`${TARGET}: file not found`);
  const src = fs.readFileSync(filePath, "utf8");
  const result = checkExpensesListQuery(src);
  if (!result.ok) fail(`${TARGET}: ${result.reason}`);
  console.log(`[${LABEL}] PASS — the expenses LIST query joins journal_entries and carries je.memo`);
}
