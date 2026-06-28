#!/usr/bin/env node
// CI guard — prevents regression of the backwards factoring eligibility filter.
//
// BUG (fixed 2026-06-27): both eligibility queries in factoring/batch.service.ts used
//   AND i.status = 'paid'
// which is BACKWARDS — a paid invoice has nothing left to advance (research doc §3.5).
// Correct filter: AND i.status IN ('sent', 'partial')
//
// This guard reads batch.service.ts and FAILS if it finds `status = 'paid'` in any
// eligibility query context (factoring eligibility block). It also FAILS if the correct
// `status IN ('sent', 'partial')` is absent, ensuring both queries were fixed.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const TARGET = resolve("apps/backend/src/factoring/batch.service.ts");

let src;
try {
  src = readFileSync(TARGET, "utf8");
} catch {
  console.error(`verify-factoring-eligibility-filter: cannot read ${TARGET}`);
  process.exit(1);
}

let failed = false;

// 1. The backwards filter must not appear in any eligibility context.
// Match "status = 'paid'" not preceded by "factoring_" (to avoid matching factoring_status comparisons).
const backwardsRe = /AND\s+i\.status\s*=\s*'paid'/g;
const backwardsMatches = [...src.matchAll(backwardsRe)];
if (backwardsMatches.length > 0) {
  console.error(
    `FAIL verify-factoring-eligibility-filter: found ${backwardsMatches.length} instance(s) of backwards` +
      ` "AND i.status = 'paid'" in ${TARGET}.\n` +
      `  Eligible invoices have status IN ('sent','partial'), NOT 'paid'.\n` +
      `  A paid invoice has already been collected — there is nothing left to advance.`
  );
  failed = true;
}

// 2. The correct filter must appear in both eligibility queries (createDraftBatch + listCandidateInvoices).
const correctRe = /AND\s+i\.status\s+IN\s+\('sent',\s*'partial'\)/g;
const correctMatches = [...src.matchAll(correctRe)];
if (correctMatches.length < 2) {
  console.error(
    `FAIL verify-factoring-eligibility-filter: expected 2 instances of correct eligibility filter` +
      ` "AND i.status IN ('sent', 'partial')" in ${TARGET} (one in createDraftBatch, one in listCandidateInvoices).` +
      ` Found ${correctMatches.length}.`
  );
  failed = true;
}

if (failed) process.exit(1);

console.log(
  `verify-factoring-eligibility-filter OK — ` +
    `0 backwards 'paid' filters, ${correctMatches.length} correct IN ('sent','partial') filters in ${TARGET}`
);
