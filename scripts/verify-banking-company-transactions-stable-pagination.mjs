#!/usr/bin/env node
/**
 * GUARD: BANK-F25150 — /api/v1/banking/plaid/company-transactions pagination stability.
 *
 * NEW-33 investigation (2026-09-07, live-reproduced): the endpoint's ORDER BY previously broke
 * ties only on (transaction_date, created_at). Bulk Plaid syncs insert many rows with the exact
 * same created_at, so those ties were free to resolve differently across two separate
 * LIMIT/OFFSET queries — a client paging through the full history could see one tied-boundary row
 * TWICE (duplicated across the page boundary) while a different tied row silently vanished from
 * both pages. Any "fetch all pages and merge client-side" consumer (e.g. the Banking running-
 * balance walk in BankingTransactionsDesignView.tsx) then double-counts or drops a transaction.
 *
 * `bt.id` is the only column guaranteed unique per row, so every sort branch must end on it.
 *
 * Run: node scripts/verify-banking-company-transactions-stable-pagination.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-banking-company-transactions-stable-pagination";
const TARGET = path.join(ROOT, "apps/backend/src/integrations/plaid/link.routes.ts");

export function auditSortSql(src) {
  const start = src.indexOf('"/api/v1/banking/plaid/company-transactions"');
  if (start < 0) {
    return ["route /api/v1/banking/plaid/company-transactions not found in link.routes.ts"];
  }
  const block = src.slice(start, start + 4000);
  const match = block.match(/const sortSql =([\s\S]*?);\n/);
  if (!match) {
    return ["sortSql ternary chain not found near the company-transactions route"];
  }
  const sortBlock = match[1];
  // Each branch is a quoted ORDER BY fragment; every one must end its tiebreak chain on bt.id.
  const branches = [...sortBlock.matchAll(/"([^"]*bt\.[a-z_]+[^"]*)"/g)].map((m) => m[1]);
  if (branches.length < 4) {
    return [
      `expected 4 quoted ORDER BY branches (date_asc/date_desc/amount_asc/amount_desc), found ${branches.length}`,
    ];
  }
  const missing = branches.filter((b) => !/bt\.id\s+ASC\s*$/.test(b.trim()));
  if (missing.length) {
    return missing.map(
      (b) => `ORDER BY branch has no trailing bt.id tiebreaker (unstable pagination): "${b}"`,
    );
  }
  return [];
}

if (process.argv.includes("--selftest")) {
  const failures = [];
  const good = `
    const sortSql =
      query.data.sort === "date_asc"
        ? "bt.transaction_date ASC, bt.created_at ASC, bt.id ASC"
        : query.data.sort === "amount_desc"
          ? "bt.amount_cents DESC, bt.transaction_date DESC, bt.id ASC"
          : query.data.sort === "amount_asc"
            ? "bt.amount_cents ASC, bt.transaction_date DESC, bt.id ASC"
            : "bt.transaction_date DESC, bt.created_at DESC, bt.id ASC";
  `;
  const wrapGood = `fastify.get(\n    "/api/v1/banking/plaid/company-transactions",\n    {},\n    async (req, reply) => {\n${good}\n});`;
  if (auditSortSql(wrapGood).length) {
    failures.push(`good-shape: false positive — ${auditSortSql(wrapGood).join(" | ")}`);
  }

  const bad = good.replace(/, bt\.id ASC/g, "");
  const wrapBad = `fastify.get(\n    "/api/v1/banking/plaid/company-transactions",\n    {},\n    async (req, reply) => {\n${bad}\n});`;
  if (!auditSortSql(wrapBad).length) {
    failures.push("planted-regression: removing bt.id from every branch was NOT caught");
  }

  const oneBad = good.replace('"bt.amount_cents ASC, bt.transaction_date DESC, bt.id ASC"', '"bt.amount_cents ASC, bt.transaction_date DESC"');
  const wrapOneBad = `fastify.get(\n    "/api/v1/banking/plaid/company-transactions",\n    {},\n    async (req, reply) => {\n${oneBad}\n});`;
  if (!auditSortSql(wrapOneBad).length) {
    failures.push("planted-regression: removing bt.id from just amount_asc was NOT caught");
  }

  if (!auditSortSql("no route here at all").length === false) {
    // route-not-found path always returns a non-empty array; nothing to assert beyond no throw.
  }

  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

const src = fs.readFileSync(TARGET, "utf8");
const problems = auditSortSql(src);
if (problems.length) {
  console.error(`${LABEL} FAILED:`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`${LABEL} OK — all 4 company-transactions ORDER BY branches end on bt.id (stable pagination)`);
process.exit(0);
