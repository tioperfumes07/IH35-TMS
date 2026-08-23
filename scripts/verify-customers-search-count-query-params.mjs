#!/usr/bin/env node
/**
 * verify-customers-search-count-query-params.mjs  (CUST-F6183)
 *
 * Root cause: GET /api/v1/mdata/customers's COUNT query used to share the exact same `values` array
 * as its WHERE clause, which included a `search%` prefix-match pattern bound ONLY for the later ROWS
 * query's ORDER BY relevance ranking — the COUNT query has no ORDER BY and never referenced that
 * parameter anywhere in its own SQL text. A bind value with no reference anywhere in a query's own
 * text gives Postgres no context to infer a type from, so the count query 500'd on every non-empty
 * `search=` value with `42P18 could not determine data type of parameter $2` — silently breaking
 * every customer search (every EntityPicker kind="customer" picker app-wide, and this endpoint's own
 * list-page callers) into "no results, + Add new", inviting duplicate customer creation. Live-
 * reproduced 2026-08-23 via the Legal Lease-to-Own contract creator's Lessee-customer picker: searching
 * "TC" (or the full name "TC Freight LLC") against a real, existing, active customer returned zero
 * results with no visible error.
 *
 * This guard makes the regression impossible to re-ship: the COUNT query's own values array
 * (`fromValues` at the point it's passed to the COUNT `client.query` call) must never include the
 * search-prefix bind value — that value must be pushed only afterward, for the ROWS query alone.
 *
 * Usage:
 *   node scripts/verify-customers-search-count-query-params.mjs            # scan
 *   node scripts/verify-customers-search-count-query-params.mjs --selftest # regression harness -> must FAIL on bug
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const repoRoot = process.cwd();
const ROUTES_FILE = "apps/backend/src/mdata/customers.routes.ts";

const COUNT_MARKER = "await client.query<{ total: number }>(";
const PREFIX_PUSH = /fromValues\.push\(`\$\{search\}%`\)/;

export function checkCountQueryOmitsPrefixParam(src) {
  const offenders = [];
  const countIdx = src.indexOf(COUNT_MARKER);
  if (countIdx === -1) {
    offenders.push(`${ROUTES_FILE}: COUNT query marker not found (has this route moved or been renamed?)`);
    return offenders;
  }
  // The prefix-pattern push must appear AFTER the COUNT query call, not before it — i.e. it must not
  // be part of the values/fromValues array the COUNT query itself receives.
  const prefixMatch = PREFIX_PUSH.exec(src);
  if (!prefixMatch) {
    offenders.push(`${ROUTES_FILE}: search-prefix bind value push not found — has the ranking logic changed shape? Re-verify this guard still applies.`);
    return offenders;
  }
  if (prefixMatch.index < countIdx) {
    offenders.push(
      `${ROUTES_FILE}: the search-prefix bind value (fromValues.push(\`\${search}%\`)) is pushed BEFORE the COUNT query runs — CUST-F6183 regression shape (COUNT query receives a parameter its own SQL text never references, 42P18 on every non-empty search)`
    );
  }
  return offenders;
}

export function run() {
  const abs = path.join(repoRoot, ROUTES_FILE);
  const src = fs.readFileSync(abs, "utf8");
  const offenders = checkCountQueryOmitsPrefixParam(src);
  return { ok: offenders.length === 0, offenders };
}

if (process.argv.includes("--selftest")) {
  const buggy = `
    const values = [];
    if (search) {
      values.push(\`%\${search}%\`);
      values.push(\`\${search}%\`);
    }
    values.push(resolvedOperatingCompanyId);
    const fromValues = values;
    const countRes = await client.query<{ total: number }>(
      \`SELECT count(*)::int AS total FROM mdata.customers \${whereClause}\`,
      fromValues
    );
    fromValues.push(limit);
    fromValues.push(offset);
  `;
  const fixed = `
    const values = [];
    if (search) {
      values.push(\`%\${search}%\`);
    }
    values.push(resolvedOperatingCompanyId);
    const fromValues = values;
    const countRes = await client.query<{ total: number }>(
      \`SELECT count(*)::int AS total FROM mdata.customers \${whereClause}\`,
      fromValues
    );
    if (search) {
      fromValues.push(\`\${search}%\`);
    }
    fromValues.push(limit);
    fromValues.push(offset);
  `;

  const buggyFails = checkCountQueryOmitsPrefixParam(buggy).length > 0;
  const fixedPasses = checkCountQueryOmitsPrefixParam(fixed).length === 0;

  if (buggyFails && fixedPasses) {
    console.log("verify:customers-search-count-query-params selftest OK");
    process.exit(0);
  }
  console.error("verify:customers-search-count-query-params selftest FAILED", { buggyFails, fixedPasses });
  process.exit(1);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { ok, offenders } = run();
  if (!ok) {
    console.error("verify:customers-search-count-query-params FAIL:\n  " + offenders.map((o) => "✗ " + o).join("\n  "));
    process.exit(1);
  }
  console.log("verify:customers-search-count-query-params OK — the COUNT query never receives the search-prefix bind value its own SQL text doesn't reference");
}
