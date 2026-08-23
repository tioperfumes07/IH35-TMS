#!/usr/bin/env node
/**
 * GUARD: a SELECT DISTINCT query's ORDER BY expression must be a column PROJECTED in the SELECT
 * list, never a raw expression re-derived from selected columns.
 *
 * FACT-F5986 / ACCT-F5986. `listFactorBatchHistoryForCustomer` (factor.service.ts) selected
 * `b.submitted_at` and `b.funded_at` individually (DISTINCT), then ordered by
 * `COALESCE(b.submitted_at, b.funded_at)` — a real, live production 500: Postgres rejects this with
 * SQLSTATE 42P10 ("for SELECT DISTINCT, ORDER BY expressions must appear in select list"), because
 * the COALESCE of two selected columns is not itself a selected column. Reproduced live against
 * Neon prod (br-fancy-credit-akjnd07a) for the exact customer cited in the finding
 * (04b65d8b-a1a3-4580-9224-d0f16b0946f5, "Semares Forwarding Services") before fixing.
 *
 * THE FIX PATTERN, and what this guard enforces: project the ORDER BY expression as its own named
 * column (`COALESCE(...) AS sort_key`) and order by that alias — never re-derive it un-projected.
 * Adding the projection cannot change which rows DISTINCT considers equal (it is a pure function of
 * columns already selected), so this is a mechanical, safe fix shape, not a semantic change.
 *
 * SCOPE, deliberately narrow: only `SELECT DISTINCT ... ORDER BY <expr>(...)` blocks inside SQL
 * template strings, where the FIRST ORDER BY key calls a function (COALESCE/GREATEST/etc.) over
 * identifiers and that exact function-call text is not itself present as a projected column (bare
 * or aliased) in the SELECT list. A plain `ORDER BY column_name` is not a function call and is not
 * flagged — that shape is always valid whether or not DISTINCT is present. The ORDER BY key list is
 * split on top-level commas only (paren-depth-aware), so a multi-arg function call like
 * `COALESCE(a, b)` is never mistaken for two keys.
 *
 * Run:  node scripts/verify-factor-batch-history-distinct-order-key.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(root, "apps/backend/src");
const LABEL = "verify-factor-batch-history-distinct-order-key";

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name !== "node_modules" && e.name !== "__tests__") walk(p, out);
    } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) out.push(p);
  }
  return out;
}

/** Split on commas at paren-depth 0 only — a multi-arg function call is one key, not several. */
function splitTopLevel(str) {
  const parts = [];
  let depth = 0;
  let cur = "";
  for (const ch of str) {
    if (ch === "(") depth += 1;
    else if (ch === ")") depth -= 1;
    if (ch === "," && depth === 0) {
      parts.push(cur);
      cur = "";
    } else {
      cur += ch;
    }
  }
  parts.push(cur);
  return parts;
}

/**
 * Extract the contents of every backtick template-literal in `src`, unescaped-backtick-aware.
 * Scanning is bounded to ONE string at a time so a SELECT DISTINCT in one query can never pair
 * with an unrelated ORDER BY (or a `for (...)` loop, or a comment) that happens to appear later in
 * the FILE but outside that same template string — the bug this guard's own first draft had.
 */
function templateLiteralBodies(src) {
  const bodies = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      let j = i + 1;
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") j += 1; // skip escaped char, including an escaped backtick
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

/**
 * Find `SELECT DISTINCT ... ORDER BY <func>(...)` blocks where the FIRST ORDER BY key's
 * function-call text is not projected (bare or `AS alias`) anywhere in the preceding SELECT list.
 */
export function offendingQueries(src) {
  const bad = [];
  for (const body of templateLiteralBodies(src)) {
    for (const m of body.matchAll(/SELECT\s+DISTINCT\b([\s\S]*?)ORDER\s+BY\s+([\s\S]*?)(?:LIMIT|$)/gi)) {
      const selectList = m[1];
      const orderBy = m[2];
      // Only the first ORDER BY key matters here — later keys are typically plain columns
      // (e.g. `b.batch_number DESC`) already covered by the "plain column is fine" rule below.
      const firstKey = splitTopLevel(orderBy)[0];
      const funcCall = firstKey.match(/([A-Z_]+\s*\([^()]*\))/i);
      if (!funcCall) continue; // ORDER BY a plain column — always valid, DISTINCT or not
      const exprText = funcCall[1].replace(/\s+/g, " ").trim();
      const selectFlat = selectList.replace(/\s+/g, " ");
      // Projected as a bare expression, or as `<expr> AS alias` — either satisfies Postgres.
      const projected = selectFlat.includes(exprText);
      if (!projected) bad.push(`ORDER BY ${exprText} is not projected in the preceding SELECT DISTINCT list`);
    }
  }
  return bad;
}

export function collectProblems(sources) {
  const problems = [];
  for (const { file, src } of sources) {
    for (const issue of offendingQueries(src)) {
      problems.push(
        `${file}: ${issue}. Postgres raises SQLSTATE 42P10 ("for SELECT DISTINCT, ORDER BY ` +
          `expressions must appear in select list") the moment this query runs — project the ` +
          `ORDER BY expression as its own \`AS alias\` column and order by the alias (FACT-F5986).`
      );
    }
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  // Fixtures are backtick-wrapped, exactly like a real `client.query(\`...\`)` call — the checker
  // only scans INSIDE template-literal bodies (see templateLiteralBodies), never raw source text.
  const tpl = (sql) => "const q = `" + sql + "`;";

  const bad = tpl(
    "SELECT DISTINCT b.id, b.submitted_at, b.funded_at FROM x " +
      "ORDER BY COALESCE(b.submitted_at, b.funded_at) DESC NULLS LAST, b.batch_number DESC LIMIT 200"
  );
  const good = tpl(
    "SELECT DISTINCT b.id, b.submitted_at, b.funded_at, COALESCE(b.submitted_at, b.funded_at) AS sort_key FROM x " +
      "ORDER BY sort_key DESC NULLS LAST, b.batch_number DESC LIMIT 200"
  );
  if (offendingQueries(bad).length !== 1) failures.push("the FACT-F5986 defect verbatim was NOT caught");
  if (offendingQueries(good).length !== 0) failures.push("the corrected (sort_key alias) shape was still flagged");

  // A bare (unaliased) projection of the exact expression is equally valid Postgres — must pass.
  const goodBare = tpl(
    "SELECT DISTINCT b.id, COALESCE(b.submitted_at, b.funded_at) FROM x " +
      "ORDER BY COALESCE(b.submitted_at, b.funded_at) DESC LIMIT 200"
  );
  if (offendingQueries(goodBare).length !== 0) failures.push("a bare (unaliased) projected expression was flagged");

  // A comment naming the fix must not satisfy the check — the projection itself must be real.
  const commented = tpl(
    "-- ordered by sort_key\n" +
      "SELECT DISTINCT b.id, b.submitted_at, b.funded_at FROM x " +
      "ORDER BY COALESCE(b.submitted_at, b.funded_at) DESC LIMIT 200"
  );
  if (offendingQueries(commented).length !== 1) {
    failures.push("a COMMENT naming the fix satisfied the check — false green");
  }

  // A plain `ORDER BY column` (no function call) is always valid, DISTINCT or not — never flagged.
  const plainOrder = tpl("SELECT DISTINCT b.id, b.batch_number FROM x ORDER BY b.batch_number DESC LIMIT 200");
  if (offendingQueries(plainOrder).length !== 0) failures.push("a plain ORDER BY column was flagged");

  // A non-DISTINCT SELECT never needs this rule at all — must never be flagged.
  const noDistinct = tpl(
    "SELECT b.id, b.submitted_at, b.funded_at FROM x ORDER BY COALESCE(b.submitted_at, b.funded_at) DESC LIMIT 200"
  );
  if (offendingQueries(noDistinct).length !== 0) failures.push("a non-DISTINCT SELECT was flagged");

  // REGRESSION (this guard's own first draft): a SELECT DISTINCT with NO ORDER BY at all, followed
  // LATER in the same file by an UNRELATED ORDER BY (a different query, or non-SQL text like a
  // `for (...)` loop) must never cross-contaminate — the first draft's un-scoped regex matched
  // straight through to that later, unrelated ORDER BY and fabricated a false positive against
  // apps/backend/src/factoring/packet-assemble.service.ts. Two SEPARATE template literals.
  const crossStringFalsePositive =
    tpl("SELECT DISTINCT l.id, l.notes FROM mdata.loads l WHERE l.operating_company_id = $1 LIMIT 500") +
    "\nfor (const row of eligibleRes.rows) {\n" +
    tpl("SELECT id FROM org.companies ORDER BY id");
  if (offendingQueries(crossStringFalsePositive).length !== 0) {
    failures.push("a SELECT DISTINCT with no ORDER BY was paired with an unrelated LATER ORDER BY — cross-string false positive");
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
    `${LABEL} SELFTEST OK — 8/8 (defect verbatim, alias fix passes, bare-projection fix passes, ` +
      `comment cannot fake a pass, plain ORDER BY never flagged, non-DISTINCT never flagged, ` +
      `no cross-template-literal false positive, end-to-end red + green)`
  );
  process.exit(0);
}

const sources = fs.existsSync(SRC)
  ? walk(SRC).map((p) => ({ file: path.relative(root, p), src: fs.readFileSync(p, "utf8") }))
  : [];
const problems = collectProblems(sources);
if (problems.length) {
  console.error(`${LABEL} FAIL — ${problems.length} unprojected-ORDER-BY-on-DISTINCT query(ies):`);
  for (const p of problems) console.error("  ✗ " + p);
  process.exit(1);
}
console.log(`${LABEL} OK — every SELECT DISTINCT's ORDER BY expression is projected in its own select list.`);
