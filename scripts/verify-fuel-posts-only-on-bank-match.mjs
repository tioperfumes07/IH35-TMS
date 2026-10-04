#!/usr/bin/env node
// OWNER RULING 2026-10-02 — "THEY ARE IMPORTED AND WORK AS A BANKING OR CREDIT CARD BANK. THEY MUST BE MATCHED TO A
// TRANSACTION OR CATEGORIZED IN BANKING." + OWNER LAW competing-engine audit (fuel posters). A fuel fill does not post
// when it is imported; it posts when its card bank line is matched in Banking, through postFuelExpenseOnClient inside the
// match transaction. Fails if:
//   1. the import-time poster (maybePostFuelExpenseFromCanonicalTxn, behind every import / cron / reflush flush) can post;
//   2. a NEW caller of the fuel GL poster appears outside the poster, the retired import path and the bank-match engine;
//   3. integrations.relay_fuel_transactions.posted_to_gl is set by hand outside the retired path, or the Relay fills
//      screen reads the stored flag instead of deriving it from a journal entry.
//   4. ACCT-F403 (Lead ruling Option 1, 2026-10-04): a Relay-rail settlement fuel row can create a fuel posting — the
//      rail resolver returns the Relay wallet instead of refusing (relay_fill_links_not_posts), the poster silently
//      defaults a fuel row to "cash", the expense-document path does not turn the refusal into relay_link, or the
//      database door (202615410950: only a Relay fill or a reversal may credit the fuel_wallet_relay account) is gone.
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
const DOC = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const DOOR = "db/migrations/202615410950_relay_wallet_consumed_only_by_relay_fill.sql";
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

  // 4. ACCT-F403 — the Relay-fill door.
  const rs = maybe.indexOf("export function resolveCompanyDirectCreditPreference(");
  const re = rs < 0 ? -1 : maybe.indexOf("\n}\n", rs);
  const resolver = rs < 0 ? "" : maybe.slice(rs, re);
  if (!resolver) problems.push(`${MAYBE}: resolveCompanyDirectCreditPreference not found (fails closed)`);
  if (/return\s+"relay_fuel_wallet"/.test(resolver)) problems.push(`${MAYBE}: the rail resolver lets a fuel row post to the Relay wallet — a Relay-rail settlement row must link to its fill, not post`);
  if (resolver && !/USMCA_COMPANY_ID\) throw new RelayFillLinksNotPostsError/.test(resolver)) problems.push(`${MAYBE}: the USMCA no-card (Relay) default must refuse with RelayFillLinksNotPostsError`);
  if (/input\.company_direct_credit \?\? "cash"/.test(files[POSTER] ?? "")) problems.push(`${POSTER}: a fuel row silently defaults to "cash" — it must resolve its rail (a Relay fill would post twice)`);
  if (!/err instanceof RelayFillLinksNotPostsError\) return \{ outcome: "relay_link"/.test(files[DOC] ?? "")) problems.push(`${DOC}: a Relay-rail fuel row must return relay_link (no document, no posting)`);
  const door = files[DOOR] ?? "";
  if (!/trg_relay_wallet_consumed_only_by_relay_fill/.test(door) || !/fuel_wallet_relay/.test(door) || !/integrations\.relay_fuel_transactions/.test(door))
    problems.push(`${DOOR}: the database door (only a Relay fill or a reversal credits the Relay wallet) is missing`);
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
  const door = path.join(ROOT, DOOR);
  if (fs.existsSync(door)) out[DOOR] = fs.readFileSync(door, "utf8");
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
    ["resolver posts Relay", { ...real, [MAYBE]: real[MAYBE].replace("if (candidate.operating_company_id === USMCA_COMPANY_ID) throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);", 'if (candidate.operating_company_id === USMCA_COMPANY_ID) return "relay_fuel_wallet";') }],
    ["poster cash default", { ...real, [POSTER]: real[POSTER].replace('credit ?? "cash"', 'input.company_direct_credit ?? "cash"') }],
    ["document posts Relay", { ...real, [DOC]: real[DOC].replace('if (err instanceof RelayFillLinksNotPostsError) return { outcome: "relay_link"', "if (false) return { outcome: \"relay_link\"") }],
    ["database door gone", { ...real, [DOOR]: "" }],
  ];
  const missed = cases.filter(([, files]) => check(files).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length} plants caught; real tree clean`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) { console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — fuel never posts at import; postFuelExpenseOnClient is the bank-match hook; posted_to_gl is derived, never hand-set`);
