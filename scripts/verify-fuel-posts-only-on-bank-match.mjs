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
//   5. ACCT-F403 link: a creation point of either side does not call the one linker (fuel/relay-fill-link.service.ts) — the
//      Settlement Creator, the app settlement seeder, the Relay ingest — so a Relay-rail settlement row never links.
//   6. LEAD RULING 443.47 (CC-3, guard scope): the ONE sanctioned fuel post outside the bank match is the Settlement
//      Creator posting a historical Relay FILL through that fill (ACCT-F44335 #26266; R9: a Relay line carries product +
//      fee; guarded by verify-creator-relay-row-posts-through-its-fill). Exactly that call shape is allowed — it posts the
//      fill itself (fuel_event_id: relayFillId) to the Relay wallet (company_direct_credit: "relay_fuel_wallet"). Any other
//      fuel post in the Creator still fails.
//   7. LEAD RULINGS 443.116 #1 (owner design 2026-10-12, "the costs should post daily, as they are received") SUPERSEDES
//      rule 1's posting MOMENT, per company: the import-time poster may post ONLY behind the company flag
//      FUEL_POSTS_ON_RECEIPT_ENABLED (read before any post; OFF -> skipped_posts_on_bank_match) and ONLY through the one
//      fill poster (postFuelFillOnReceipt) — never the retired postFuelExpenseFromEvent. The bank match finds a fill that
//      already posted FIRST (findPostedFuelEvent) and posts nothing; unmatch never reverses a JE posted on receipt
//      (fuel.posted_on_receipt). The receipt poster and the match share ONE fill poster (postFuelFill).
// Static, <1s. --selftest plants each regression.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "verify-fuel-posts-only-on-bank-match";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MAYBE = "apps/backend/src/accounting/fuel-posting/maybe-post-from-fuel-transaction.service.ts";
const PREF = "apps/backend/src/accounting/fuel-posting/fuel-credit-preference.ts";
const POSTER = "apps/backend/src/accounting/fuel-posting/poster.service.ts";
const MATCH = "apps/backend/src/accounting/bank-recon/match.service.ts";
const FILLS = "apps/backend/src/fuel/relay-fills.routes.ts";
const FEED = "apps/backend/src/feed/seed-settlement-document.service.ts";
const DOC = "apps/backend/src/fuel/fuel-expense-document.service.ts";
const DOOR = "db/migrations/202615410950_relay_wallet_consumed_only_by_relay_fill.sql";
const FILLPOST = "apps/backend/src/accounting/bank-recon/bank-match-fuel-post.service.ts";
const UNMATCH = "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts";
const CREATOR = "apps/backend/src/driver-finance/settlement-creator.service.ts";
// LEAD 443.121 #1 — ONE fuel receipt identity (migration + every writer asks first).
const RECEIPT_MIG = "db/migrations/202615850910_fuel_receipt_one_posting_identity.sql";
/** Rule 6: the Creator's one sanctioned call — posts the Relay fill itself to the Relay wallet. */
const CREATOR_RELAY_FILL_POST = /postFuelExpenseOnClient\(client as never, \{(?:(?!postFuelExpense)[\s\S]){0,500}?fuel_event_id: relayFillId,(?:(?!postFuelExpense)[\s\S]){0,500}?company_direct_credit: "relay_fuel_wallet",/g;
const LINK_SITES = {
  "apps/backend/src/driver-finance/settlement-creator.service.ts": /linkSettlementFuelRowToRelayFill\(/,
  "apps/backend/src/feed/seed-settlement-document.service.ts": /linkSettlementFuelRowToRelayFill\(/,
  "apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts": /linkRelayFillToSettlementFuelRows\(/,
};
// Allowlist = poster + gated import path + bank-match engine only. Feed retired 2026-10-02
// (owner: fuel posts only on bank match). No REPORTED_OTHER_LANE exemption.

export function check(files) {
  const problems = [];
  const maybe = files[MAYBE] ?? "";
  const i = maybe.indexOf("export async function maybePostFuelExpenseFromCanonicalTxn(");
  // 7 (443.116 #1) — the receipt post: flag-gated per company, through the one fill poster only.
  const body = i < 0 ? "" : maybe.slice(i, maybe.indexOf("\n}\n", i));
  const flagRead = body.indexOf("isEnabled(client, FUEL_POSTS_ON_RECEIPT_FLAG_KEY");
  const offExit = body.indexOf('if (!receiptOn) return { status: "skipped_posts_on_bank_match" };');
  const receiptPost = body.indexOf("postFuelFillOnReceipt(");
  if (i < 0 || flagRead < 0 || offExit < 0 || receiptPost < 0 || offExit > receiptPost || flagRead > offExit)
    problems.push(`${MAYBE}: the import-time fuel poster can post without the company flag FUEL_POSTS_ON_RECEIPT_ENABLED (or not through postFuelFillOnReceipt)`);
  if (/postFuelExpenseFromEvent\(/.test(body)) problems.push(`${MAYBE}: the import-time poster calls the retired postFuelExpenseFromEvent — one fill poster only (postFuelFillOnReceipt)`);
  if (!/export const FUEL_POSTS_ON_RECEIPT_FLAG_KEY = "FUEL_POSTS_ON_RECEIPT_ENABLED";/.test(maybe)) problems.push(`${MAYBE}: FUEL_POSTS_ON_RECEIPT_FLAG_KEY is not the seeded flag key`);
  const fp = files[FILLPOST] ?? "";
  const ms = fp.indexOf("export async function postFuelFillOnBankMatch(");
  const mBody = ms < 0 ? "" : fp.slice(ms, fp.indexOf("\n}\n", ms));
  const found = mBody.indexOf("findPostedFuelEvent(");
  const post = mBody.indexOf("postFuelFill(");
  if (ms < 0 || found < 0 || post < 0 || found > post) problems.push(`${FILLPOST}: the bank match must find a fill already posted (on receipt) BEFORE posting — it would post the fill a second time`);
  const rs2 = fp.indexOf("export async function postFuelFillOnReceipt(");
  const rBody = rs2 < 0 ? "" : fp.slice(rs2, fp.indexOf("\n}\n", rs2));
  if (rs2 < 0 || !/postFuelFill\(client, input\)/.test(rBody) || !/FUEL_POSTED_ON_RECEIPT_EVENT/.test(rBody))
    problems.push(`${FILLPOST}: postFuelFillOnReceipt must post through the one fill poster (postFuelFill) and record fuel.posted_on_receipt`);
  const un = files[UNMATCH] ?? "";
  if (!/event_class = 'fuel\.posted_on_receipt'/.test(un) || !/if \(onReceipt\.rows\.length\) matchCreatedJe = false;/.test(un))
    problems.push(`${UNMATCH}: unmatch would reverse a fill posted on receipt (it was only matched by the bank line)`);
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
    if (f === POSTER || f === MAYBE || f === MATCH || f === FILLPOST) continue;
    const scanned = f === CREATOR ? src.replace(CREATOR_RELAY_FILL_POST, "/* rule 6: Relay fill posted through its fill */") : src;
    if (/\bpostFuelExpense(FromEvent|OnClient)\(/.test(scanned)) problems.push(`${f}: posts fuel expense outside the bank match`);
    if (/SET\s+posted_to_gl\s*=\s*true/i.test(src)) problems.push(`${f}: sets relay posted_to_gl by hand`);
  }
  if (/\br\.posted_to_gl\b/.test(files[FILLS] ?? "")) problems.push(`${FILLS}: reads the stored posted_to_gl flag instead of deriving it from a journal entry`);

  // 4. ACCT-F403 — the Relay-fill door.
  const pref = files[PREF] ?? "";
  const rs = pref.indexOf("export function resolveCompanyDirectCreditPreference(");
  const re = rs < 0 ? -1 : pref.indexOf("\n}\n", rs);
  const resolver = rs < 0 ? "" : pref.slice(rs, re);
  if (!resolver) problems.push(`${PREF}: resolveCompanyDirectCreditPreference not found (fails closed)`);
  if (/return\s+"relay_fuel_wallet"/.test(resolver)) problems.push(`${PREF}: the rail resolver lets a fuel row post to the Relay wallet — a Relay-rail settlement row must link to its fill, not post`);
  if (resolver && !/USMCA_COMPANY_ID\) throw new RelayFillLinksNotPostsError/.test(resolver)) problems.push(`${PREF}: the USMCA no-card (Relay) default must refuse with RelayFillLinksNotPostsError`);
  if (/input\.company_direct_credit \?\? "cash"/.test(files[POSTER] ?? "")) problems.push(`${POSTER}: a fuel row silently defaults to "cash" — it must resolve its rail (a Relay fill would post twice)`);
  if (!/err instanceof RelayFillLinksNotPostsError\) return \{ outcome: "relay_link"/.test(files[DOC] ?? "")) problems.push(`${DOC}: a Relay-rail fuel row must return relay_link (no document, no posting)`);
  const door = files[DOOR] ?? "";
  if (!/trg_relay_wallet_consumed_only_by_relay_fill/.test(door) || !/fuel_wallet_relay/.test(door) || !/integrations\.relay_fuel_transactions/.test(door))
    problems.push(`${DOOR}: the database door (only a Relay fill or a reversal credits the Relay wallet) is missing`);
  // 5. ACCT-F403 — both sides link through the one rule.
  for (const [f, re] of Object.entries(LINK_SITES)) {
    if (!re.test(files[f] ?? "")) problems.push(`${f}: creates a Relay fill / settlement fuel row without calling the one linker (fuel/relay-fill-link.service.ts) — the settlement row would never link to its fill`);
  }
  // 8 (LEAD 443.121 #1) — ONE fuel receipt identity across import, Settlement Creator and bank match: the database refuses a
  // second live posting of a receipt, and every writer finds a receipt's existing posting (any writer) before posting.
  const mig = files[RECEIPT_MIG] ?? "";
  if (!/^CREATE UNIQUE INDEX IF NOT EXISTS fuel_receipt_postings_one_live_uk\s+ON fuel\.fuel_receipt_postings \(operating_company_id, receipt_key\)\s+WHERE released_at IS NULL;/m.test(mig))
    problems.push(`${RECEIPT_MIG}: the one-live-posting-per-receipt unique index is missing — a receipt could post twice`);
  if (!/^CREATE TRIGGER trg_register_fuel_receipt_posting\s+AFTER INSERT ON accounting\.posting_batches/m.test(mig) || !/fuel_receipt_already_posted/.test(mig))
    problems.push(`${RECEIPT_MIG}: posting batches are not registered against their receipt by trigger — a writer that forgets would post a receipt twice`);
  const poster = files[POSTER] ?? "";
  if (!/export async function findPostedFuelReceipt\(/.test(poster)) problems.push(`${POSTER}: findPostedFuelReceipt (the one receipt lookup) is missing`);
  const fe = poster.indexOf("export async function findPostedFuelEvent(");
  const feBody = fe < 0 ? "" : poster.slice(fe, poster.indexOf("\n}\n", fe));
  if (!/findPostedFuelReceipt\(client, operatingCompanyId, "fuel_event", fuelEventId\)/.test(feBody))
    problems.push(`${POSTER}: findPostedFuelEvent ignores a receipt posted by another writer (the Creator's expense document) — the bank match would post it again`);
  const pe = poster.indexOf("export async function postFuelExpenseOnClient(");
  const peBody = pe < 0 ? "" : poster.slice(pe, poster.indexOf("\n}\n", pe));
  const rcpt = peBody.indexOf('findPostedFuelReceipt(client, input.operating_company_id, "fuel_event", input.fuel_event_id)');
  const batch = peBody.indexOf("INSERT INTO accounting.posting_batches");
  if (rcpt < 0 || batch < 0 || rcpt > batch) problems.push(`${POSTER}: postFuelExpenseOnClient posts before asking whether the receipt already posted`);
  const cr = files[CREATOR] ?? "";
  const crAsk = cr.indexOf('findPostedFuelReceipt(client as never, draft.operating_company_id, "expense", doc.expense_id)');
  const crPost = cr.indexOf('source_transaction_type: "expense",\n            source_transaction_id: doc.expense_id');
  if (crAsk < 0 || crPost < 0 || crAsk > crPost) problems.push(`${CREATOR}: the Creator posts a fuel expense document without adopting the receipt's existing posting`);
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
  const mig = path.join(ROOT, RECEIPT_MIG);
  if (fs.existsSync(mig)) out[RECEIPT_MIG] = fs.readFileSync(mig, "utf8");
  return out;
}

if (process.argv.includes("--selftest")) {
  const real = load();
  if (check(real).length) { console.error(`${LABEL} --selftest FAIL: real tree not clean: ${check(real)[0]}`); process.exit(1); }
  const cases = [
    ["import poster ungated", { ...real, [MAYBE]: real[MAYBE].replace('if (!receiptOn) return { status: "skipped_posts_on_bank_match" };', "") }],
    ["import poster ignores the company flag", { ...real, [MAYBE]: real[MAYBE].replace("isEnabled(client, FUEL_POSTS_ON_RECEIPT_FLAG_KEY", "isEnabled(client, FUEL_EXPENSE_GL_POSTING_FLAG_KEY") }],
    ["import poster back on the retired poster", { ...real, [MAYBE]: real[MAYBE].replace("return postFuelFillOnReceipt(client as never, {", "await postFuelExpenseFromEvent({}); return postFuelFillOnReceipt(client as never, {") }],
    ["match posts a fill already posted on receipt", { ...real, [FILLPOST]: real[FILLPOST].replace("const already = await findPostedFuelEvent(client, input.operating_company_id, input.fill_id);\n  if (already) return already;\n  return postFuelFill(client, input);", "return postFuelFill(client, input);") }],
    ["receipt poster bypasses the one fill poster", { ...real, [FILLPOST]: real[FILLPOST].replace("const posted = await postFuelFill(client, input);", "const posted = await postCanonicalFuelTxn(client, input);") }],
    ["unmatch reverses a receipt-posted fill", { ...real, [UNMATCH]: real[UNMATCH].replace("if (onReceipt.rows.length) matchCreatedJe = false;", "") }],
    ["new fuel poster caller", { ...real, "apps/backend/src/x/new.ts": "await postFuelExpenseFromEvent(input)" }],
    ["hand-set posted_to_gl", { ...real, "apps/backend/src/x/new.ts": "UPDATE integrations.relay_fuel_transactions SET posted_to_gl = true" }],
    ["fills reads stored flag", { ...real, [FILLS]: real[FILLS] + "\n// r.posted_to_gl" }],
    ["resolver posts Relay", { ...real, [PREF]: real[PREF].replace("if (candidate.operating_company_id === USMCA_COMPANY_ID) throw new RelayFillLinksNotPostsError(candidate.fuel_transaction_id);", 'if (candidate.operating_company_id === USMCA_COMPANY_ID) return "relay_fuel_wallet";') }],
    ["poster cash default", { ...real, [POSTER]: real[POSTER].replace('credit ?? "cash"', 'input.company_direct_credit ?? "cash"') }],
    ["document posts Relay", { ...real, [DOC]: real[DOC].replace('if (err instanceof RelayFillLinksNotPostsError) return { outcome: "relay_link"', "if (false) return { outcome: \"relay_link\"") }],
    ["database door gone", { ...real, [DOOR]: "" }],
    ["creator posts a non-Relay fuel row", { ...real, [CREATOR]: real[CREATOR] + "\nawait postFuelExpenseOnClient(client as never, { fuel_event_id: fuelId, company_direct_credit: \"cash\" });" }],
    ["creator's relay-fill post credits another rail", { ...real, [CREATOR]: real[CREATOR].replace('company_direct_credit: "relay_fuel_wallet",', 'company_direct_credit: "cash",') }],
    ["creator never links", { ...real, ["apps/backend/src/driver-finance/settlement-creator.service.ts"]: real["apps/backend/src/driver-finance/settlement-creator.service.ts"].replaceAll("linkSettlementFuelRowToRelayFill(", "noop(") }],
    ["ingest never links", { ...real, ["apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts"]: real["apps/backend/src/integrations/relay-payments/relay-fuel-ingest.service.ts"].replaceAll("linkRelayFillToSettlementFuelRows(", "noop(") }],
    ["receipt unique index gone", { ...real, [RECEIPT_MIG]: real[RECEIPT_MIG].replace("CREATE UNIQUE INDEX IF NOT EXISTS fuel_receipt_postings_one_live_uk", "CREATE INDEX IF NOT EXISTS fuel_receipt_postings_one_live_uk") }],
    ["receipt registration trigger gone", { ...real, [RECEIPT_MIG]: real[RECEIPT_MIG].replace("CREATE TRIGGER trg_register_fuel_receipt_posting", "-- CREATE TRIGGER trg_register_fuel_receipt_posting") }],
    ["bank match blind to the Creator's posting", { ...real, [POSTER]: real[POSTER].replace('?? (await findPostedFuelReceipt(client, operatingCompanyId, "fuel_event", fuelEventId))', "") }],
    ["poster posts without asking the receipt", { ...real, [POSTER]: real[POSTER].replace('const receiptPosted = await findPostedFuelReceipt(client, input.operating_company_id, "fuel_event", input.fuel_event_id);', "const receiptPosted = null;") }],
    ["creator posts the receipt again", { ...real, [CREATOR]: real[CREATOR].replace('findPostedFuelReceipt(client as never, draft.operating_company_id, "expense", doc.expense_id)', "Promise.resolve(null)") }],
  ];
  const missed = cases.filter(([, files]) => check(files).length === 0).map(([n]) => n);
  if (missed.length) { console.error(`${LABEL} --selftest FAIL: not caught: ${missed.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${cases.length}/${cases.length} plants caught; real tree clean`);
  process.exit(0);
}

const problems = check(load());
if (problems.length) { console.error(`${LABEL}: FAIL —\n  ${problems.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — a fill posts on receipt only behind FUEL_POSTS_ON_RECEIPT_ENABLED through the one fill poster, else at bank match; the match never posts a fill twice; posted_to_gl is derived, never hand-set; one live posting per fuel receipt (443.121 #1)`);
