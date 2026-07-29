#!/usr/bin/env node
/**
 * ACCT-LINK-06 — the bank-feed live tie-out must classify completed categorization by
 * banking.bank_transactions.status, never review_state. The CHAIN-05 poster intentionally
 * transitions review_state from for_review to matched while preserving status='categorized';
 * review_state='categorized' is therefore an empty/non-terminal predicate that silently
 * excludes posted categorization rows from the integrity check.
 *
 * This is a static regression guard. The DB-connected tie-out remains responsible for proving
 * the live account / match / JE invariants; this guard prevents its state predicate from
 * drifting away from the canonical categorize and poster writers.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-link-06-bank-state-semantics";
const TIEOUT = "scripts/verify-bank-feed-live-tieout.mjs";
const CATEGORIZATION_ROUTE = "apps/backend/src/banking/categorization.routes.ts";
const POSTER = "apps/backend/src/banking/bank-feed-gl-posting.service.ts";

function read(root, rel) {
  return fs.readFileSync(path.join(root, rel), "utf8");
}

export function contractErrors(root = ROOT) {
  const failures = [];
  const tieout = read(root, TIEOUT);
  const route = read(root, CATEGORIZATION_ROUTE);
  const poster = read(root, POSTER);

  if (!/WHERE\s+status\s*=\s*['"]categorized['"][\s\S]{0,400}categorization_gl_account_id\s+IS\s+NULL/.test(tieout)) {
    failures.push("live tie-out must validate resolved accounts using status='categorized'");
  }
  if (/review_state\s*=\s*['"]categorized['"]/.test(tieout)) {
    failures.push("live tie-out must not use review_state='categorized'; posted rows become review_state='matched'");
  }
  if (!/NOT IN \('transfer', 'fuel'\)/.test(tieout) && !/IS DISTINCT FROM 'transfer'/.test(tieout)) {
    failures.push("live tie-out must exclude transfer/fuel/insurance label-only categorizations that omit GL account");
  }
  if (!/linked_entity_id IS NULL/.test(tieout)) {
    failures.push("live tie-out must treat linked_entity_id (bill categorize) as resolved without GL");
  }
  if (!/category\), ''\) NOT IN \('transfer', 'fuel', 'insurance', 'bill'\)/.test(tieout) && !/'bill'/.test(tieout)) {
    failures.push("live tie-out must exclude obligation/bill label-only categories");
  }
  if (!/status\s*=\s*['"]categorized['"]/.test(route)) {
    failures.push("categorization route must persist status='categorized'");
  }
  if (!/review_state\s*=\s*['"]matched['"]/.test(poster)) {
    failures.push("CHAIN-05 poster must mark its successful post review_state='matched'");
  }

  return failures;
}

function selftest() {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), `${LABEL}-`));
  try {
    for (const rel of [TIEOUT, CATEGORIZATION_ROUTE, POSTER]) {
      const target = path.join(tmp, rel);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.copyFileSync(path.join(ROOT, rel), target);
    }

    if (contractErrors(tmp).length) throw new Error("correct source failed the state-semantics contract");

    const tieoutPath = path.join(tmp, TIEOUT);
    fs.writeFileSync(
      tieoutPath,
      fs.readFileSync(tieoutPath, "utf8").replace("WHERE status = 'categorized'", "WHERE review_state = 'categorized'")
    );
    if (!contractErrors(tmp).some((failure) => failure.includes("review_state='categorized'"))) {
      throw new Error("selftest did not catch review_state categorization regression");
    }
    console.log(`${LABEL}: selftest PASS — caught review_state categorization regression`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const failures = contractErrors();
if (failures.length) {
  console.error(`${LABEL}: FAIL`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — categorized status and matched review state remain distinct`);
