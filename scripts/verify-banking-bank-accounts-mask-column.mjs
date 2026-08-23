#!/usr/bin/env node
/**
 * GUARD: a SQL query touching `banking.bank_accounts` must never reference a bare `mask` column —
 * the real, only-ever-existing column is `account_mask`.
 *
 * BANK-F5987. `apps/backend/src/banking/reconciliation.routes.ts` built the reconciliation
 * workspace's bank-account human label with `RIGHT(COALESCE(mask, ''), 4)`. `banking.bank_accounts`
 * has NO `mask` column — the canonical column, present since the table's own creating migration
 * (db/migrations/0072_p5_t1_1_banking_bank_accounts.sql:17) and reused by BANK-F13's own uniqueness
 * index, is `account_mask`. Every GET workspace call that reached this label lookup threw SQLSTATE
 * 42703 ("column mask does not exist"). Reproduced live against Neon prod (br-fancy-credit-akjnd07a)
 * before fixing (RESET ROLE + bypass, plain SELECT: NeonDbError column "mask" does not exist);
 * confirmed fixed after (real account names / mask-derived fallback labels returned).
 *
 * SCOPE, deliberately narrow: only backtick template literals that reference
 * `banking.bank_accounts` (FROM or JOIN) somewhere in the SAME literal, checked for a bare `mask`
 * word-boundary occurrence not already part of `account_mask` (or any other `..._mask` /
 * `mask_...` identifier). A literal with no `banking.bank_accounts` reference is never scanned —
 * this cannot flag unrelated masking language elsewhere in the codebase (error-masking comments,
 * Plaid mask helpers on a different table, etc.).
 *
 * Run:  node scripts/verify-banking-bank-accounts-mask-column.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-banking-bank-accounts-mask-column";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

/** Extract the contents of every backtick template-literal in `src` (escaped-backtick-aware). */
function templateLiteralBodies(src) {
  const bodies = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") j += 1;
        j += 1;
      }
      bodies.push(src.slice(i + 1, j));
      i = j + 1;
    } else {
      i += 1;
    }
  }
  return bodies;
}

export function offendingQueries(src) {
  const bad = [];
  for (const body of templateLiteralBodies(src)) {
    if (!/banking\.bank_accounts/i.test(body)) continue;
    // A `mask` occurrence not immediately preceded by a word char + `_` (e.g. account_mask) and not
    // immediately followed by `_` + word char (e.g. mask_something) is a bare, phantom reference.
    for (const m of body.matchAll(/\bmask\b/gi)) {
      const before1 = body.slice(Math.max(0, m.index - 1), m.index);
      const after = body.slice(m.index + m[0].length, m.index + m[0].length + 1);
      const isSuffix = before1 === "_"; // e.g. account_mask
      const isPrefix = after === "_"; // e.g. mask_something
      // `... AS mask` names an OUTPUT alias, not a column being READ — `account_mask AS mask` is
      // the correct, intentional shape (real column, renamed for the API/JS response). Only the
      // whitespace-trimmed text immediately before the token is checked, so `AS   mask` also counts.
      const beforeTrim = body.slice(Math.max(0, m.index - 12), m.index).replace(/\s+$/, "");
      const isAliasTarget = /\bAS$/i.test(beforeTrim);
      if (!isSuffix && !isPrefix && !isAliasTarget) {
        bad.push("bare `mask` column reference alongside banking.bank_accounts");
      }
    }
  }
  return bad;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const issue of offendingQueries(src)) {
      problems.push(
        `${file}: ${issue}. banking.bank_accounts has no \`mask\` column — Postgres raises SQLSTATE ` +
          `42703 ("column \\"mask\\" does not exist") the moment this query runs. Use \`account_mask\` ` +
          `(BANK-F5987).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const tpl = (sql) => "const q = `" + sql + "`;";

  const bad = tpl(
    "SELECT COALESCE(NULLIF(TRIM(account_name), ''), CONCAT('Bank account •', RIGHT(COALESCE(mask, ''), 4))) AS account_label FROM banking.bank_accounts WHERE id = $1::uuid"
  );
  if (offendingQueries(bad).length !== 1) failures.push("the BANK-F5987 defect verbatim was NOT caught");

  const good = tpl(
    "SELECT COALESCE(NULLIF(TRIM(account_name), ''), CONCAT('Bank account •', RIGHT(COALESCE(account_mask, ''), 4))) AS account_label FROM banking.bank_accounts WHERE id = $1::uuid"
  );
  if (offendingQueries(good).length !== 0) failures.push("the corrected (account_mask) shape was still flagged");

  // REGRESSION (this guard's own first draft): `account_mask AS mask` — the real column, correctly
  // renamed to `mask` for the API/JS response shape — is a valid, intentional alias TARGET, not a
  // phantom column being READ. The first draft flagged this verbatim against two real, correct
  // files (plaid-items.routes.ts, exhibit-c-bank-reconciliation.ts) before shipping.
  const aliasTarget = tpl("SELECT a.account_mask AS mask, a.name FROM banking.bank_accounts a WHERE a.id = $1");
  if (offendingQueries(aliasTarget).length !== 0) {
    failures.push("`account_mask AS mask` (a correct alias target) was flagged — false positive against real code");
  }

  // A literal with no banking.bank_accounts reference at all must never be scanned, even with a
  // bare `mask` word in it (a different table's real `mask` column, e.g. Plaid raw account data).
  const otherTable = tpl("SELECT mask FROM plaid_raw.accounts WHERE id = $1");
  if (offendingQueries(otherTable).length !== 0) {
    failures.push("a bare `mask` on an UNRELATED table (no banking.bank_accounts in the literal) was flagged");
  }

  // A comment naming the fix must not satisfy the check — the column itself must be real.
  const commented = tpl(
    "-- uses account_mask now\nSELECT COALESCE(mask,'') FROM banking.bank_accounts WHERE id = $1"
  );
  if (offendingQueries(commented).length !== 1) {
    failures.push("a COMMENT naming the fix satisfied the check — false green");
  }

  // Two separate template literals in one file: banking.bank_accounts in one (clean), an unrelated
  // bare `mask` word in a LATER, separate literal — must not cross-contaminate (same class of bug
  // this guard's sibling, verify-factor-batch-history-distinct-order-key.mjs, had to fix).
  const crossString =
    tpl("SELECT account_mask FROM banking.bank_accounts WHERE id = $1") +
    "\nconst other = " +
    tpl("SELECT mask FROM some_other_table WHERE id = $1");
  if (offendingQueries(crossString).length !== 0) {
    failures.push("cross-template-literal false positive — an unrelated LATER literal's bare `mask` was flagged");
  }

  // End-to-end through the real checker.
  if (collectProblems([{ file: "x.ts", src: bad }]).length !== 1) failures.push("collectProblems missed the defect");
  if (collectProblems([{ file: "x.ts", src: good }]).length !== 0) failures.push("collectProblems flagged a fix");

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error("  - " + f);
    process.exit(1);
  }
  console.log(
    `${LABEL} SELFTEST OK — 8/8 (defect verbatim, fix passes, alias-target never flagged, ` +
      `unrelated table never scanned, comment cannot fake a pass, no cross-template-literal false ` +
      `positive, end-to-end red + green)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} bare mask-column reference(s):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — every banking.bank_accounts query uses the real account_mask column.`);
