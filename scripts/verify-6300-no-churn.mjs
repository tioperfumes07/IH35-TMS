#!/usr/bin/env node
// ROUND 326 queue item 14 (G-18, CC-1) — 6300 BANK SERVICE CHARGES: $174K gross for $220 net. The automatic churn loop:
// unmatching a categorized bank line reversed its categorization JE but left status='categorized' with no JE, and the
// categorized-backlog poster (status='categorized' AND matched_journal_entry_id IS NULL) re-posted it — reverse,
// re-post, reverse — a full-amount DR/CR pair per cycle. Fails if:
//   1. either unmatch path (recon-worklist unmatchBankTransaction, the session unmatch) stops sending a line whose
//      categorization JE it reverses back to 'pending_categorization';
//   2. the backlog poster stops excluding lines whose categorization JE was already reversed.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-6300-no-churn";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const F = {
  worklist: "apps/backend/src/accounting/bank-recon/recon-worklist.service.ts",
  session: "apps/backend/src/banking/reconciliation.routes.ts",
  backlog: "apps/backend/src/banking/categorization.routes.ts",
};
const RESET = /status = CASE WHEN prior\.matched_journal_entry_id IS NOT NULL AND bt\.status = 'categorized'\s*THEN 'pending_categorization' ELSE bt\.status END/;

export function problems(src) {
  const p = [];
  if (!RESET.test(src.worklist)) p.push("recon-worklist unmatch must send a reversed categorized line back to pending_categorization");
  if (!RESET.test(src.session)) p.push("the session unmatch must send a reversed categorized line back to pending_categorization");
  const b = src.backlog;
  const sel = b.slice(b.indexOf("AND bt.status = 'categorized'"), b.indexOf("AND bt.status = 'categorized'") + 1200);
  if (!/AND NOT EXISTS \([\s\S]*source_transaction_type = 'bank_categorization'[\s\S]*je\.reversed_by_je_id IS NOT NULL/.test(sel)) p.push("the categorized-backlog poster must skip lines whose categorization JE was reversed");
  return p;
}

export function run() {
  return problems(Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")])));
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, readFileSync(path.join(ROOT, v), "utf8")]));
  const own = problems(src);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    const plants = [
      ["worklist leaves categorized", { ...src, worklist: src.worklist.replace("THEN 'pending_categorization' ELSE bt.status END", "THEN bt.status ELSE bt.status END") }],
      ["session leaves categorized", { ...src, session: src.session.replace("THEN 'pending_categorization' ELSE bt.status END", "THEN bt.status ELSE bt.status END") }],
      ["backlog re-posts reversed", { ...src, backlog: src.backlog.replace("AND je.reversed_by_je_id IS NOT NULL\n            )", "AND false\n            )") }],
    ];
    for (const [name, planted] of plants) {
      if (!problems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
    }
    console.log(`${LABEL} --selftest PASS (real tree clean; ${plants.length}/${plants.length} plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL — ${own.join("; ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — an unmatched categorized line returns to the queue, and the backlog never re-posts a reversed categorization.`);
}
