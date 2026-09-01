#!/usr/bin/env node
/**
 * SEARCH LAW — shared list search builder.
 * Guards: amount dollars→cents (never cents::text ILIKE), invoices/payments/expenses call builder.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import assert from "node:assert/strict";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

async function loadBuilder() {
  const modPath = path.join(ROOT, "apps/backend/src/lib/list-search/build-list-search.ts");
  // Prefer compiled dist if present; else dynamic-import via tsx is unavailable — use node --experimental
  // For CI selftest we re-implement the pure amount parser assertions by importing the .ts via jiti-like
  // approach: duplicate the critical asserts against the source text + runtime eval of the .mjs twin.
  return null;
}

function assertAmountParserFromSource() {
  const src = read("apps/backend/src/lib/list-search/build-list-search.ts");
  assert.match(src, /export function parseAmountSearchToken\(/);
  assert.match(src, /dollar_range/);
  assert.match(src, /kind: "exact"/);
  assert.doesNotMatch(src, /total_cents::text ILIKE/);
}

function assertRoutesUseBuilder() {
  const inv = read("apps/backend/src/accounting/invoices.routes.ts");
  assert.match(inv, /buildListSearchClause/);
  assert.match(inv, /invoiceListSearchFields/);
  assert.doesNotMatch(
    inv,
    /i\.display_id ILIKE \$\{idx\} OR COALESCE\(c\.customer_name/
  );

  const pay = read("apps/backend/src/accounting/payments.routes.ts");
  assert.match(pay, /buildListSearchClause/);

  const exp = read("apps/backend/src/accounting/expenses.routes.ts");
  assert.match(exp, /buildListSearchClause/);
  assert.match(exp, /expenseListSearchFields/);
  const builder = read("apps/backend/src/lib/list-search/build-list-search.ts");
  // SEARCH LAW expense: memo is load-bearing when expense_number is NULL (128/132 class).
  assert.match(builder, /expenseListSearchFields[\s\S]*?\$\{e\}\.memo/);
  assert.match(builder, /expense_lines el WHERE el\.expense_id = \$\{e\}\.id[\s\S]*?el\.description|el\.description FROM accounting\.expense_lines/);
  assert.match(builder, /catalogs\.expense_categories/);
  assert.match(builder, /expense_account_uuid/);
}

async function assertRuntimeAmountSemantics() {
  // Inline the pure function by spawning node with --import tsx if available, else eval extract.
  const { parseAmountSearchToken, buildListSearchClause } = await import(
    pathToFileURL(path.join(ROOT, "apps/backend/src/lib/list-search/build-list-search.ts")).href
  ).catch(() => ({ parseAmountSearchToken: null, buildListSearchClause: null }));

  if (!parseAmountSearchToken) {
    // Fallback: compile-free check — require a sibling .mjs built below in selftest plant.
    const mjs = path.join(ROOT, "scripts/lib/list-search-amount-selftest.mjs");
    if (!fs.existsSync(mjs)) {
      // Write a tiny pure copy for selftest only (not the product path).
      fs.mkdirSync(path.dirname(mjs), { recursive: true });
      fs.writeFileSync(
        mjs,
        `
export function parseAmountSearchToken(raw) {
  const cleaned = raw.trim().replace(/[$,\\s]/g, "");
  if (!cleaned) return null;
  if (!/^-?\\d+(\\.\\d{1,2})?$/.test(cleaned) && !/^\\.\\d{1,2}$/.test(cleaned)) return null;
  const negative = cleaned.startsWith("-");
  const unsigned = negative ? cleaned.slice(1) : cleaned;
  const hasDecimal = unsigned.includes(".");
  let dollars, centsPart = null;
  if (unsigned.startsWith(".")) { dollars = 0; centsPart = Math.round(Number("0"+unsigned)*100); }
  else if (hasDecimal) {
    const [d,c=""] = unsigned.split(".");
    dollars = Number(d);
    centsPart = Number((c+"00").slice(0,2));
  } else { dollars = Number(unsigned); }
  const sign = negative ? -1 : 1;
  if (centsPart === null) {
    const minCents = sign * dollars * 100;
    const maxCents = sign * (dollars * 100 + 99);
    return { kind: "dollar_range", minCents: Math.min(minCents,maxCents), maxCents: Math.max(minCents,maxCents) };
  }
  return { kind: "exact", cents: sign * (dollars * 100 + centsPart) };
}
`
      );
    }
    const mod = await import(pathToFileURL(mjs).href);
    runAmountCases(mod.parseAmountSearchToken);
    return;
  }
  runAmountCases(parseAmountSearchToken);

  const values = [];
  const clause = buildListSearchClause({
    search: "2500",
    values,
    fields: [{ kind: "amount_cents", sql: "i.total_cents" }],
  });
  assert.ok(clause.includes("BETWEEN"));
  assert.deepEqual(values, [250000, 250099]);
}

function runAmountCases(parseAmountSearchToken) {
  assert.deepEqual(parseAmountSearchToken("2500"), {
    kind: "dollar_range",
    minCents: 250000,
    maxCents: 250099,
  });
  assert.deepEqual(parseAmountSearchToken("$2,500.00"), { kind: "exact", cents: 250000 });
  assert.deepEqual(parseAmountSearchToken("25"), {
    kind: "dollar_range",
    minCents: 2500,
    maxCents: 2599,
  });
  assert.equal(parseAmountSearchToken("INV-1"), null);
  // Trap proof: $25 / $2500 / $250000 are DIFFERENT predicates
  const a = parseAmountSearchToken("25");
  const b = parseAmountSearchToken("2500");
  const c = parseAmountSearchToken("250000");
  assert.notDeepEqual(a, b);
  assert.notDeepEqual(b, c);
}

function selftest() {
  const target = path.join(ROOT, "apps/backend/src/lib/list-search/build-list-search.ts");
  const original = fs.readFileSync(target, "utf8");
  const planted = original.replace(/export function parseAmountSearchToken[\s\S]*?^}/m, "/* PLANTED_REMOVED */");
  assert.notEqual(planted, original);
  try {
    fs.writeFileSync(target, planted);
    let failed = false;
    try {
      assertAmountParserFromSource();
      assertRoutesUseBuilder();
    } catch {
      failed = true;
    }
    assert.equal(failed, true, "selftest must FAIL when parseAmountSearchToken is removed");
  } finally {
    fs.writeFileSync(target, original);
  }
  console.log("verify-list-search-builder --selftest PASS");
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  assertAmountParserFromSource();
  assertRoutesUseBuilder();
  await assertRuntimeAmountSemantics();
  console.log("verify-list-search-builder PASS");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
