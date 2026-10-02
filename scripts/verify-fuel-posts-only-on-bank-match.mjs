#!/usr/bin/env node
// OWNER RULING 2026-10-02 — "THEY ARE IMPORTED AND WORK AS A BANKING OR CREDIT CARD BANK. THEY MUST BE MATCHED TO A
// TRANSACTION OR CATEGORIZED IN BANKING." + OWNER LAW competing-engine audit (fuel posters). A fuel fill does not post
// when it is imported; it posts when its card bank line is matched in Banking, through postFuelExpenseOnClient inside the
// match transaction. Fails if:
//   1. the import-time poster (maybePostFuelExpenseFromCanonicalTxn, behind every import / cron / reflush flush) can post;
//   2. a NEW caller of the fuel GL poster appears outside the poster, the retired import path and the bank-match engine;
//   3. integrations.relay_fuel_transactions.posted_to_gl is set by hand outside the retired path, or the Relay fills
//      screen reads the stored flag instead of deriving it from a journal entry.
// Static, <1s. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-posts-only-on-bank-match";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAYBE = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
const POSTER = "apps/backend/src/accounting/fuel-posting/poster.service.ts";
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const FILLS = "apps/backend/src/fuel/relay-fills.routes.ts";
const FEED = "apps/backend/src/feed/seed-settlement-document.service.ts";
// Allowlist = poster + gated import path + bank-match engine only. Feed retired 2026-10-02
// (owner: fuel posts only on bank match). No REPORTED_OTHER_LANE exemption.

export function check(files) {
  const problems = [];
  const maybe = files[MAYBE] ?? "";
  const i = maybe.indexOf("export async function maybePostFuelExpenseFromCanonicalTxn(");
  const gate = maybe.indexOf('if (FUEL_POSTS_ON_BANK_MATCH_ONLY) return { status: "skipped_posts_on_bank_match" };', i);
  const firstPost = maybe.indexOf("postFuelExpenseFromEvent(", i);
  if (i < 0 || gate < 0 || (firstPost >= 0 && gate > firstPost)) problems.push(`${MAYBE}: the import-time fuel poster can post`);
  if (!/export async function postFuelExpenseOnClient\(/.test(files[POSTER] ?? "")) problems.push(`${POSTER}: postFuelExpenseOnClient (the bank-match hook) is missing`);
  // ROUND 288.2 — match engine MUST call the bank-match hook (CC-2 #24027 FOR CURSOR).
  const matchSrc = files[MATCH] ?? "";
  if (!/postFuelFillOnBankMatch|postFuelExpenseOnClient/.test(matchSrc)) {
    problems.push(`${MATCH}: must call postFuelFillOnBankMatch / postFuelExpenseOnClient inside the match (fuel flags alone book nothing)`);
  }
  if (!/matched_journal_entry_id = \$5::uuid/.test(matchSrc) && !/matched_journal_entry_id = \$\{/.test(matchSrc) && !/fuelJournalEntryId/.test(matchSrc)) {
    problems.push(`${MATCH}: fuel match must stamp matched_journal_entry_id in the same transaction as review_state='matched'`);
  }
  const feedSrc = files[FEED] ?? "";
  if (/\bpostFuelExpense(FromEvent|OnClient)\(/.test(feedSrc)) {
    problems.push(`${FEED}: feed must not post fuel GL — bank match only`);
  }
  if (/\bcreateExpenseFromFuelTransaction\(/.test(feedSrc)) {
    problems.push(`${FEED}: feed must not mint fuel expense documents — bank match only`);
  }
  for (const [f, src] of Object.entries(files)) {
    if (!f.startsWith("apps/backend/src/") || /\.test\.ts$|__tests__/.test(f)) continue;
    if (f === POSTER || f === MAYBE || f === MATCH || f === "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts") continue;
    if (/\bpostFuelExpense(FromEvent|OnClient)\(/.test(src)) problems.push(`${f}: posts fuel expense outside the bank match`);
    if (/SET\s+posted_to_gl\s*=\s*true/i.test(src)) problems.push(`${f}: sets relay posted_to_gl by hand`);
  }
  if (/\br\.posted_to_gl\b/.test(files[FILLS] ?? "")) problems.push(`${FILLS}: reads the stored posted_to_gl flag instead of deriving it from a journal entry`);
  return problems;
}

function load() {
  const out = {};
  const walk = (dir) => {
    for (const e of fs.readdirSync(path.join(ROOT, dir), { withFileTypes: true })) {
      const rel = `${dir}/${e.name}`;
      if (e.isDirectory()) walk(rel);
      else if (/\.ts$/.test(e.name)) out[rel] = fs.readFileSync(path.join(ROOT, rel), "utf8");
    }
  };
  walk("apps/backend/src");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: real tree not clean: ${check(real)[0]}`); process.exit(1); }
  const cases = [
    ["import poster ungated", { ...real, [MAYBE]: real[MAYBE].replace('if (FUEL_POSTS_ON_BANK_MATCH_ONLY) return { status: "skipped_posts_on_bank_match" };', "") }],
    ["new fuel poster caller", { ...real, "apps/backend/src/x/new.ts": "await postFuelExpenseFromEvent(input)" }],
    ["hand-set posted_to_gl", { ...real, "apps/backend/src/x/new.ts": "UPDATE integrations.relay_fuel_transactions SET posted_to_gl = true" }],
    ["fills reads stored flag", { ...real, [FILLS]: real[FILLS] + "\n// r.posted_to_gl" }],
  ];
  const missed = cases.filter(([, files]) => check(files).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length} plants caught; real tree clean`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) { console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — fuel never posts at import; postFuelExpenseOnClient is the bank-match hook; posted_to_gl is derived, never hand-set`);
