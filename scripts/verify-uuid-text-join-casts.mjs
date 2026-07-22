#!/usr/bin/env node
/**
 * Bans the `uuid = text` join class in backend SQL.
 *
 * WHY (found twice in one day, 2026-07-22, in PRs #3229 and #3230):
 * a handful of accounting columns that LOOK like uuid foreign keys are actually `text` on the live
 * database. Comparing them to a real uuid primary key raises
 *
 *     operator does not exist: uuid = text
 *
 * which is not a "no rows" outcome — it aborts the statement. In both PRs the bad join sat in the
 * FIRST query of a detail handler, before its `if (!row) return 404`, so it 500'd EVERY request to
 * that endpoint including the not-found path. #3229 was caught only because an integration test
 * asserted 404 and got 500; #3230 had no such test and would have shipped a dead Bill Payment
 * detail page to production.
 *
 * The pairs below were verified against the Neon prod branch br-fancy-credit-akjnd07a on
 * 2026-07-22 via information_schema, and the failure was reproduced there directly. Note that the
 * neighbouring columns are NOT all text — accounting.expenses.vendor_uuid and
 * accounting.factoring_advances.factoring_company_vendor_id are genuine uuid, and joining those
 * without a cast is correct. That inconsistency is exactly why this needs a guard rather than a
 * convention: reading the surrounding code teaches you the wrong rule half the time.
 *
 * THE FIX IS ALWAYS `<uuid side>::text = <text column>`, never `<text column>::uuid`. These columns
 * are free-form text; a non-uuid value in one makes `::uuid` RAISE, turning a row that should
 * simply not match into another 500.
 *
 * Run: node scripts/verify-uuid-text-join-casts.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-uuid-text-join-casts";
const SCAN_DIR = "apps/backend/src";

/**
 * `<schema>.<table>.<column>` entries that are `text` on prod despite uuid-looking names.
 *
 * This list is TABLE-QUALIFIED on purpose. `vendor_id` is text on accounting.bills /
 * accounting.bill_payments / accounting.vendor_credits / accounting.vendor_balances /
 * insurance.policy, and genuine uuid on fuel.fuel_transactions, maintenance.work_orders,
 * maintenance.parts_invoice_links, banking.bank_transaction_splits, safety.accident_reports and
 * others. Matching on the column NAME alone flags a dozen perfectly correct joins — which is
 * exactly what the first draft of this guard did. Verified 2026-07-22 against
 * br-fancy-credit-akjnd07a; re-verify before adding or removing an entry.
 */
export const TEXT_COLUMNS = {
  "accounting.bills": ["vendor_id", "vendor_uuid"],
  "accounting.bill_payments": ["vendor_id"],
  "accounting.vendor_credits": ["vendor_id"],
  "accounting.vendor_balances": ["vendor_id"],
  "insurance.policy": ["vendor_id"],
  "accounting.journal_entry_postings": ["source_transaction_id"],
};

/** Maps SQL aliases to their table, e.g. `FROM accounting.bills b` -> {b: "accounting.bills"}. */
export function aliasMap(source) {
  const map = new Map();
  const pattern = /\b(?:FROM|JOIN)\s+([a-z_]+\.[a-z_]+)\s+(?:AS\s+)?([a-z][a-z0-9_]*)\b/gi;
  for (const m of source.matchAll(pattern)) {
    const [, table, alias] = m;
    if (/^(on|where|order|group|left|right|inner|outer|using|limit|and|as)$/i.test(alias)) continue;
    map.set(alias, table.toLowerCase());
  }
  return map;
}

/**
 * Flags `<alias>.id = <expr mentioning a text column>` when the uuid side carries no ::text cast.
 * Narrow on purpose: only fires on `.id` on the left (the primary-key side, always uuid) and only
 * when the right-hand alias resolves to a table this file actually joins AND that table's column is
 * on the verified text list. A cast on either side, or a bound parameter, is fine.
 */
export function findUncastJoins(source) {
  const hits = [];
  const aliases = aliasMap(source);
  const lines = source.split("\n");

  const isTextRef = (ref) => {
    const [alias, column] = ref.split(".");
    if (!alias || !column) return false;
    const table = aliases.get(alias.toLowerCase());
    if (!table) return false;
    return (TEXT_COLUMNS[table] ?? []).includes(column.toLowerCase());
  };

  const pattern = /\b(\w+)\.id\s*=\s*((?:COALESCE\s*\([^)]*\))|[\w.]+)/g;

  lines.forEach((line, i) => {
    // Skip comment lines — the guidance comments quote the broken form on purpose.
    if (/^\s*(--|\/\/|\*)/.test(line)) return;
    for (const m of line.matchAll(pattern)) {
      const [, leftAlias, right] = m;
      const refs = right.match(/\b\w+\.\w+\b/g) ?? [];
      if (!refs.some(isTextRef)) continue;
      if (new RegExp(String.raw`\b${leftAlias}\.id::text\s*=`).test(line)) continue;
      hits.push({
        line: i + 1,
        text: line.trim(),
        reason: `${leftAlias}.id (uuid) compared to a text column without ::text — raises "operator does not exist: uuid = text"`,
      });
    }
  });

  // The wrong-direction fix is its own defect: ::uuid on free-form text raises on a bad value.
  lines.forEach((line, i) => {
    if (/^\s*(--|\/\/|\*)/.test(line)) return;
    if (!/\.id\s*=/.test(line)) return;
    // Lookahead, not a consuming match: `[^\n]{0,80}?::uuid` swallowed everything from the first
    // table reference through the cast, so the actual offending ref was never examined. The
    // selftest caught exactly that.
    for (const m of line.matchAll(/\b(\w+\.\w+)(?=\s*::uuid)/g)) {
      if (!isTextRef(m[1])) continue;
      hits.push({
        line: i + 1,
        text: line.trim(),
        reason: "text column cast to ::uuid in a join — a non-uuid value RAISES instead of not matching; cast the uuid side to ::text instead",
      });
      break;
    }
  });

  return hits;
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

function selftest() {
  const problems = [];

  // Correct code, INCLUDING the uuid-typed neighbours that the name-only first draft wrongly flagged.
  const good = `
    FROM accounting.bills b
    LEFT JOIN mdata.vendors v
      ON v.id::text = COALESCE(b.vendor_id, b.vendor_uuid)
    FROM accounting.bill_payments bp
    LEFT JOIN mdata.vendors v2 ON v2.id::text = bp.vendor_id
    FROM accounting.expenses ex
    LEFT JOIN mdata.vendors ev ON ev.id = ex.vendor_uuid
    FROM fuel.fuel_transactions ft
    LEFT JOIN mdata.vendors fv ON fv.id = ft.vendor_id
    FROM maintenance.work_orders wo
    LEFT JOIN mdata.vendors wv ON wv.id = wo.vendor_id
    LEFT JOIN mdata.drivers dr ON dr.id = e.driver_uuid
    WHERE b.id = $1::uuid
  `;
  const goodHits = findUncastJoins(good);
  if (goodHits.length !== 0) {
    problems.push(`good fixture should pass, got: ${goodHits.map((h) => h.text).join(" | ")}`);
  }

  const cases = [
    ["uncast COALESCE form", `FROM accounting.bills b\nLEFT JOIN mdata.vendors v ON v.id = COALESCE(b.vendor_id, b.vendor_uuid)`, "operator does not exist"],
    ["uncast direct form", `FROM accounting.bill_payments bp\nLEFT JOIN mdata.vendors v ON v.id = bp.vendor_id`, "operator does not exist"],
    ["wrong-direction ::uuid cast", `FROM accounting.bill_payments bp\nLEFT JOIN mdata.vendors v ON v.id = bp.vendor_id::uuid`, "RAISES instead of not matching"],
    ["postings source id", `FROM accounting.journal_entry_postings p\nJOIN accounting.expenses e ON e.id = p.source_transaction_id`, "operator does not exist"],
    ["insurance policy vendor", `FROM insurance.policy ip\nLEFT JOIN mdata.vendors v ON v.id = ip.vendor_id`, "operator does not exist"],
  ];

  for (const [name, snippet, expectFragment] of cases) {
    const hits = findUncastJoins(snippet);
    if (!hits.some((h) => h.reason.includes(expectFragment))) {
      problems.push(`planted regression "${name}" was NOT caught — assertion is ineffective`);
    }
  }

  if (problems.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const p of problems) console.error("  •", p);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest OK — good fixture passes; ${cases.length} planted regressions all caught`);
}

function main() {
  const files = walk(path.join(ROOT, SCAN_DIR));
  const failures = [];
  for (const file of files) {
    const hits = findUncastJoins(fs.readFileSync(file, "utf8"));
    for (const hit of hits) {
      failures.push(`${path.relative(ROOT, file)}:${hit.line}  ${hit.reason}\n      ${hit.text}`);
    }
  }
  if (failures.length) {
    console.error(`${LABEL} FAIL — uuid = text join(s) that will 500 at runtime:`);
    for (const f of failures) console.error(`  - ${f}`);
    console.error(`\n  Fix: cast the uuid side, e.g. v.id::text = b.vendor_id. Never <text>::uuid.`);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — no uncast uuid = text joins in ${SCAN_DIR}`);
}

if (process.argv.includes("--selftest")) selftest();
else main();
