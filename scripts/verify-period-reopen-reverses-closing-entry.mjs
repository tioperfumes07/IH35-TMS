#!/usr/bin/env node
// ROUND 300 (CC-1, proven on a Neon fork) — reopening a period undoes its retained-earnings closing entry. Reopen left
// the closing JE posted and linked, so the year's P&L stayed swept while the period was open, and a re-close returned
// the stale JE after the P&L changed. Fails if the reopen route stops (1) reversing the period's
// retained_earnings_entry_id with reverseJournalEntryNoFlip (linked reversal, original never flipped) in the reopen
// transaction, or (2) clearing retained_earnings_entry_id; or if the close service stops treating a reversed closing
// JE as absent.
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-period-reopen-reverses-closing-entry";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTES = "apps/backend/src/accounting/p7-wave2.routes.ts";
const CLOSE = "apps/backend/src/accounting/period-close-retained-earnings.service.ts";

export function problems(routes, close) {
  const p = [];
  const r = routes.slice(routes.indexOf('"/api/v1/accounting/periods/:id/reopen"'));
  const reopen = r.slice(0, r.indexOf("app.get(") > 0 ? r.indexOf("app.get(") : undefined);
  if (!/retained_earnings_entry_id = NULL/.test(reopen)) p.push(`${ROUTES}: reopen must clear retained_earnings_entry_id`);
  if (!/await reverseJournalEntryNoFlip\(client as never, \{[\s\S]{0,200}journalEntryId: reJeId/.test(reopen)) p.push(`${ROUTES}: reopen must reverse the closing JE with reverseJournalEntryNoFlip`);
  if (!/const liveClose = priorCloses\.rows\.find\(\(r\) => r\.status === "posted" && !r\.reversed\)/.test(close)) p.push(`${CLOSE}: a reversed closing JE must not count as the live close`);
  return p;
}

export function run() { return problems(readFileSync(path.join(ROOT, ROUTES), "utf8"), readFileSync(path.join(ROOT, CLOSE), "utf8")); }

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const routes = readFileSync(path.join(ROOT, ROUTES), "utf8");
  const close = readFileSync(path.join(ROOT, CLOSE), "utf8");
  const own = problems(routes, close);
  if (process.argv.includes("--selftest")) {
    if (own.length) { console.error(`${LABEL} --selftest FAIL on the real tree — ${own.join("; ")}`); process.exit(1); }
    if (!problems(routes.replace("journalEntryId: reJeId", "journalEntryId: undefined"), close).length) { console.error(`${LABEL} --selftest FAIL — missing reversal not caught`); process.exit(1); }
    if (!problems(routes.replace("retained_earnings_entry_id = NULL,", ""), close).length) { console.error(`${LABEL} --selftest FAIL — link kept not caught`); process.exit(1); }
    console.log(`${LABEL} --selftest PASS (real tree clean; 2/2 plants caught)`);
    process.exit(0);
  }
  if (own.length) { console.error(`${LABEL}: FAIL —\n  ${own.join("\n  ")}`); process.exit(1); }
  console.log(`${LABEL}: OK — period reopen reverses its closing entry; the next close computes a fresh one.`);
}
