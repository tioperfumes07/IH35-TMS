#!/usr/bin/env node
/**
 * verify-banking-match-qbo-engine — ROUND 157-C / 156 MASTER SPEC
 * Date cascade 3→7→From/To. Type filter restored (ROUND 433-CUR B3) and, with Payee / Amount from-to, lives on the ONE
 * matcher (MatchDrawer) since LEAD 443.163 (register M3/M5).
 *
 * LEAD 443.155 (owner design 2026-10-16, handoff "Engine register" addendum):
 *   DEFECT 1 — every candidate source in fetchLedgerCandidates() is scoped to the bank line's own account (its
 *   ledger / paid-from / deposited-to, or an open clearing item that lands in an operating bank); no cross-account row.
 *   DEFECT 2 — the union carries A/R invoices and factoring purchases (owner ruling 2026-09-30: every document).
 *   A NEW candidate source fails here until its account scope is declared in SCOPED_SOURCES.
 *
 * Usage: node scripts/verify-banking-match-qbo-engine.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = {
  service: "apps/backend/src/accounting/bank-recon/match.service.ts",
  predicate: "apps/backend/src/accounting/bank-recon/settlement-born-candidates.ts",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
  api: "apps/frontend/src/api/banking.ts",
  view: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  feed: "apps/backend/src/integrations/plaid/link.routes.ts",
  // LEAD 443.168 J — description → payee + category suggestion, both directions, with the reason.
  engine: "apps/backend/src/banking/banking-rules.engine.ts",
  payee: "apps/backend/src/banking/bank-description-payee.ts",
  plaid: "apps/backend/src/integrations/plaid/plaid.service.ts",
  recon: "apps/backend/src/banking/reconciliation.routes.ts",
  relay: "apps/backend/src/integrations/relay-payments/relay-wallet-bank-feed.service.ts",
  // LEAD 443.168 K — E-47 misdirected-payment alert.
  e47: "apps/backend/src/factoring/misdirected-payment-alert.service.ts",
  e47sql: "db/migrations/202615980910_factoring_misdirected_payment_alerts.sql",
  // 443.343-C — per-line Accept / Change / Reject + who/when; no apply-all.
  categorize: "apps/backend/src/banking/categorization.routes.ts",
  queue: "apps/frontend/src/pages/banking/components/NeedsCategorizingQueue.tsx",
};
const LABEL = "verify-banking-match-qbo-engine";
const read = (rel) => (fs.existsSync(path.join(ROOT, rel)) ? fs.readFileSync(path.join(ROOT, rel), "utf8") : "");
const readAll = () => Object.fromEntries(Object.entries(FILES).map(([k, rel]) => [k, read(rel)]));

/** 443.155 — each candidate source and the predicate that ties it to the bank line's account. */
export const SCOPED_SOURCES = {
  payment: /p\.deposited_to_account_id::text = \$6::text/,
  deposit: /d\.bank_account_id = \$6::uuid/,
  bill_payment: /bp\.from_bank_account_id = \$6::uuid/,
  expense: /e\.payment_account_uuid = \$6::uuid/,
  bill: /if \(onOperatingBank && wants\("bill"\)\)/,
  relay_deposit: /if \(onRelayWallet && wants\("relay_deposit"\)\)/,
  factoring_advance: /if \(onOperatingBank && wants\("factoring_advance"\)\)/,
  invoice: /if \(onOperatingBank && wants\("invoice"\)\)/,
  // LEAD 443.168 N
  transfer: /THEN t\.to_account_id::text IN \(\$7::text, \$8::text\)\s*ELSE t\.from_account_id::text IN \(\$7::text, \$8::text\)/,
  je: /AND p\.account_id = \$6::uuid\s*AND p\.debit_or_credit = \(CASE WHEN \$7::boolean THEN 'debit' ELSE 'credit' END\)/,
  relay_fuel: /if \(onRelayWallet && wants\("relay_fuel"\)\)/,
};

export function candidateScopeProblems(service) {
  const p = [];
  const start = service.indexOf("async function fetchLedgerCandidates(");
  const end = start < 0 ? -1 : service.indexOf("\n}\n", start);
  const body = start < 0 ? "" : service.slice(start, end);
  if (!body) return ["service: fetchLedgerCandidates() not found"];
  const kinds = [...new Set([...body.matchAll(/wants\("([a-z_]+)"\)/g)].map((m) => m[1]))];
  for (const k of kinds) {
    if (!SCOPED_SOURCES[k]) p.push(`service: candidate source "${k}" has no declared bank-account scope (443.155 DEFECT 1) — declare it in SCOPED_SOURCES`);
    else if (!SCOPED_SOURCES[k].test(body)) p.push(`service: candidate source "${k}" is not scoped to the bank line's account (443.155 DEFECT 1)`);
  }
  // LEAD 443.158 M1b — a document already consumed by a bank line is never a candidate for another line (owner case:
  // EXP-2026-00067, matched to its own line, offered on two other $500 lines).
  for (const [kind, re] of [
    ["payment", /cbt\.matched_payment_id = p\.id/],
    ["deposit", /cbt\.matched_deposit_id = d\.id/],
    ["bill_payment", /cbt\.matched_bill_payment_id = bp\.id/],
    ["expense", /cbt\.matched_expense_id = e\.id/],
  ]) {
    if (kinds.includes(kind) && !re.test(body)) p.push(`service: candidate source "${kind}" offers a document already matched to another bank line (443.158 M1b)`);
  }
  if (kinds.includes("expense") && !/AND e\.source_bank_transaction_id IS NULL/.test(body))
    p.push('service: candidate source "expense" offers an expense born from another bank line (443.158 M1b)');
  // LEAD 443.158 M1c — the default search applies the relevance floor (amount within tolerance OR similarity >= 0.5).
  if (!/export function passesMatchRelevanceFloor\(/.test(service) || !/\.filter\(\(c\) => explicitSearch \|\| passesRelevanceFloor\(c\)\)/.test(service))
    p.push("service: the default match search has no relevance floor — a document with neither amount nor resemblance is offered (443.158 M1c)");
  if (!/input\.amountGapCents <= input\.toleranceCents \|\| input\.similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN/.test(service))
    p.push("service: passesMatchRelevanceFloor must be amount-within-tolerance OR similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN (443.158 M1c)");
  if (!/FROM accounting\.factoring_purchases/.test(body) || !kinds.includes("factoring_advance"))
    p.push("service: factoring purchases are not in the candidate union (443.155 DEFECT 2)");
  if (!/FROM accounting\.invoices/.test(body) || !kinds.includes("invoice"))
    p.push("service: A/R invoices are not in the candidate union (443.155 DEFECT 2)");
  if (!/register = \(await client\.query[\s\S]{0,1500}FROM banking\.bank_accounts ba/.test(body))
    p.push("service: fetchLedgerCandidates must read the bank line's own account (ledger / operating / Relay wallet) before any source");
  return p;
}

/** 443.155 F — a Faro wire's suggestion is its purchase (exact net or the same-date group), with a reason; the stored
 *  2150 category is not served when a purchase covers the wire. */
export function faroSuggestionProblems({ route, feed }) {
  const p = [];
  if (!route || !/if \(c\.ledger_entry_kind === "factoring_advance"\) return c\.exact_amount;/.test(route))
    p.push("route: /banking/transactions/suggest never qualifies a Faro purchase (443.155 F)");
  if (!route || !/suggested_reason:/.test(route)) p.push("route: suggestions carry no reason (443.155 F, Law B)");
  if (!route || !/g\.length > 1 && g\.reduce\(/.test(route)) p.push("route: a Faro wire funding several purchases of one date is never suggested (443.155 F)");
  if (!feed || !/far\.role = 'factoring_advance_liability'[\s\S]{0,600}FROM accounting\.factoring_purchases fp/.test(feed))
    p.push("feed: the stored 2150 suggestion is served on a Faro wire whose purchase is on the books (443.155 F)");
  return p;
}

/**
 * 443.168 J — the payee the bank text names (Zelle to/from, wire ORIG/BNF, card merchant, PMNT SENT, ACH company, Relay
 * merchant) becomes ONE vendor (out) / customer (in) suggestion with its default account and the reason; suggest-only
 * (Law B); every ingest path gets it; the feed serves the reason and the register shows it.
 */
export function describedPayeeProblems({ engine, payee, plaid, recon, relay, feed, view, api }) {
  const p = [];
  for (const pat of ["zelle_to", "zelle_from", "wire_in", "wire_out", "card", "pmnt_sent", "ach", "relay_fuel"]) {
    if (!new RegExp(`return \\{ pattern: "${pat}"`).test(payee)) p.push(`payee: parseBankDescription does not read the ${pat} shape (443.168 J)`);
  }
  if (!/scored\[1\]!\.score === scored\[0\]!\.score\) return null/.test(payee)) p.push("payee: an ambiguous name (tie) is suggested — it must say nothing (443.168 J)");
  if (!/const pool = isCredit \? parties\.customers : parties\.vendors/.test(payee)) p.push("payee: money-in must resolve a CUSTOMER, money-out a VENDOR (443.168 J)");
  const apply = engine.match(/export async function applyDescribedPayeeForTransaction\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!apply) p.push("engine: applyDescribedPayeeForTransaction is missing (443.168 J)");
  else {
    if (!/suggested_reason = \$6/.test(apply)) p.push("engine: the described-payee suggestion carries no reason (Law B)");
    if (/\b(categorized_at|categorization_[a-z_]+|matched_[a-z_]+_id)\s*=/.test(apply)) p.push("engine: the described-payee path writes a categorization / match (Law B: suggest only)");
    if (!/suggested_source IS NULL OR suggested_source LIKE 'description_payee:%'/.test(apply)) p.push("engine: the described-payee path overwrites an authored-rule / Plaid / Faro suggestion");
  }
  if (!/suggested_reason = \$5/.test(engine)) p.push("engine: an authored-rule suggestion carries no reason (Law B)");
  const bulk = engine.match(/export async function applyBankingRulesForCompany\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!/is_credit = true[\s\S]{0,300}applyDescribedPayeeForTransaction\(client/.test(bulk)) p.push("engine: the company pass never suggests a payee on money-in lines (443.168 J)");
  const one = engine.match(/export async function suggestForBankTransaction\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!/applyBankingRulesForTransaction[\s\S]*applyDescribedPayeeForTransaction[\s\S]*applyFuzzyVendorMatchForTransaction/.test(one))
    p.push("engine: suggestForBankTransaction must run rule → described payee → fuzzy (443.168 J)");
  for (const [k, src] of [["plaid", plaid], ["recon", recon], ["relay", relay]]) {
    if (!/await suggestForBankTransaction\(/.test(src)) p.push(`${k}: a newly-ingested line skips the one suggestion entry (443.168 J)`);
  }
  if (!/bt\.suggested_reason,/.test(feed) || !/sc\.customer_name AS suggested_customer_name/.test(feed)) p.push("feed: suggested_reason / suggested customer not served (443.168 J)");
  if (!/suggested_reason\?: string \| null/.test(api)) p.push("api: PlaidBankTransaction lacks suggested_reason");
  if (!/data-testid="bank-txn-suggested-reason"/.test(view)) p.push("view: the register does not show why it suggested the payee (Law B)");
  return p;
}

/**
 * 443.168 K (Engine Registry E-47) — matching a customer payment on a Faro-purchased invoice raises the alert with the
 * 1-business-day forward-by date in the match transaction (the one write point, storeMatch); posts nothing; the register
 * shows the deadline.
 */
export function misdirectedAlertProblems({ service, e47, e47sql, feed, view }) {
  const p = [];
  const store = service.match(/async function storeMatch\([\s\S]*?\n}\n/)?.[0] ?? "";
  if (!/await raiseMisdirectedPaymentAlerts\(client/.test(store)) p.push("service: storeMatch never raises the E-47 misdirected-payment alert (443.168 K)");
  if (!/export function misdirectedForwardByDate[\s\S]{0,300}nextBusinessDay\(/.test(e47)) p.push("e47: the forward-by date is not the next business day (443.168 K)");
  if (!/JOIN accounting\.factoring_purchase_lines l ON l\.invoice_id = d\.invoice_id AND l\.voided_at IS NULL/.test(e47)) p.push("e47: the alert is not tied to a live Faro purchase line (443.168 K)");
  if (!/if \(!line \|\| !line\.is_credit\) return/.test(e47)) p.push("e47: money out can raise a misdirected-payment alert");
  if (/journal_entries|posting_line|postSourceTransaction|insertPostingLine/.test(e47)) p.push("e47: the alert posts — E-47 posts nothing");
  if (![/CREATE TABLE IF NOT EXISTS accounting\.factoring_misdirected_payment_alerts/, /forward_by date NOT NULL/, /FORCE ROW LEVEL SECURITY/, /audit\.tg_audit_row\(\)/].every((re) => re.test(e47sql)))
    p.push("migration: factoring_misdirected_payment_alerts table / forward_by / RLS / audit missing (443.168 K)");
  if (!/AS misdirected_forward_by/.test(feed)) p.push("feed: the forward-by deadline is not served on the bank row (443.168 K)");
  if (!/data-testid="bank-txn-misdirected-alert"/.test(view)) p.push("view: the register does not show the forward-to-Faro deadline (443.168 K)");
  return p;
}

/**
 * 443.343-C — Categorize / Match shows per line what the engine suggests and WHY (payee, vendor,
 * account, confidence, source, reason); Accept / Change / Reject on each line; who+when on accepted;
 * no auto-accept; no "apply all".
 */
export function suggestionReasonUiProblems({ view, api, feed, categorize, queue }) {
  const p = [];
  if (!/export function suggestionSourceLabel/.test(view)) p.push("view: suggestionSourceLabel missing (443.343-C)");
  if (!/export function categorizationConfidenceLabel/.test(view)) p.push("view: categorizationConfidenceLabel missing (443.343-C)");
  if (!/export function categorizedWhoWhenText/.test(view)) p.push("view: categorizedWhoWhenText missing (443.343-C)");
  if (!/data-testid="bank-txn-suggested-confidence"/.test(view)) p.push("view: Suggested line hides confidence (443.343-C)");
  if (!/data-testid="bank-txn-suggested-source"/.test(view)) p.push("view: Suggested line hides source (443.343-C)");
  if (!/data-testid="bank-txn-suggestion-actions"/.test(view)) p.push("view: Accept/Change/Reject actions missing (443.343-C)");
  if (!/bank-txn-suggestion-accept-/.test(view)) p.push("view: Accept button missing (443.343-C)");
  if (!/bank-txn-suggestion-change-/.test(view)) p.push("view: Change button missing (443.343-C)");
  if (!/bank-txn-suggestion-reject-/.test(view)) p.push("view: Reject button missing (443.343-C)");
  if (!/data-testid="bank-txn-categorized-who-when"/.test(view)) p.push("view: who+when on accepted lines missing (443.343-C)");
  if (!/rejectBankTransactionSuggestion/.test(api)) p.push("api: rejectBankTransactionSuggestion missing (443.343-C)");
  if (!/categorized_by_user_id\?:/.test(api) || !/categorized_by_user_name\?:/.test(api)) {
    p.push("api: categorized_by_user_* not on PlaidBankTransaction (443.343-C)");
  }
  if (!/bt\.categorized_by_user_id::text/.test(feed) || !/AS categorized_by_user_name/.test(feed)) {
    p.push("feed: categorized_by_user not served (443.343-C)");
  }
  if (!/LEFT JOIN identity\.users cat_user/.test(feed)) p.push("feed: identity.users join for who missing (443.343-C)");
  if (!/\/reject-suggestion/.test(categorize)) p.push("categorize: reject-suggestion route missing (443.343-C)");
  const rejectUpd = categorize.match(/reject-suggestion[\s\S]*?RETURNING id/)?.[0] ?? "";
  if (!rejectUpd || !/suggested_vendor_id = NULL/.test(rejectUpd) || !/suggested_reason = NULL/.test(rejectUpd)) {
    p.push("categorize: reject-suggestion must clear suggested_* only (443.343-C)");
  }
  if (/categorized_at\s*=/.test(rejectUpd)) {
    p.push("categorize: reject-suggestion must not categorize the line (443.343-C)");
  }
  // Flag UI only (testid / button label) — comments may say "bulk-accept".
  if (/needs-categorizing-accept-all|Accept all</.test(queue)) {
    p.push("queue: Accept all forbidden (443.343-C — per-line only)");
  }
  if (!/needs-cat-reject-/.test(queue)) p.push("queue: Reject per line missing (443.343-C)");
  if (/auto.?accept|autoAccept|auto_accept/i.test(view) && /Accept all/i.test(view)) {
    p.push("view: auto-accept / apply-all present (443.343-C)");
  }
  return p;
}

export function problemsFor({ service, predicate, route, api, view, drawer, feed, engine, payee, plaid, recon, relay, e47, e47sql, categorize, queue }) {
  const p = [
    ...misdirectedAlertProblems({ service, e47, e47sql, feed, view }),
    ...candidateScopeProblems(service),
    ...faroSuggestionProblems({ route, feed }),
    ...describedPayeeProblems({ engine, payee, plaid, recon, relay, feed, view, api }),
    ...suggestionReasonUiProblems({ view, api, feed, categorize, queue }),
  ];
  for (const f of ["counterparty_kind", "counterparty_name", "counterparty_id", "reference", "description", "open_balance_cents", "payee_similarity"]) {
    if (!new RegExp(`^\\s*${f}\\??:`, "m").test(service)) p.push(`service: MatchCandidate lacks ${f}`);
  }

  if (/export const QBO_DAYS_BEFORE\s*=\s*90/.test(service) || /export const QBO_DAYS_AFTER\s*=\s*20/.test(service)) {
    p.push("service: QBO_DAYS_BEFORE/AFTER must be retired (ROUND 207 cascade)");
  }
  if (/export const QBO_DAYS_BEFORE/.test(service) || /export const QBO_DAYS_AFTER/.test(service)) {
    p.push("service: QBO_DAYS_BEFORE/AFTER must be retired (ROUND 207 cascade)");
  }
  if (!/export const MATCH_WINDOW_STEPS = \{[\s\S]*?step1:\s*\{\s*before:\s*3,\s*after:\s*1\s*\}[\s\S]*?step2:\s*\{\s*before:\s*7,\s*after:\s*2\s*\}/.test(service)) {
    p.push("service: MATCH_WINDOW_STEPS must be step1 {3,1} and step2 {7,2}");
  }
  if (!/auto_widened:\s*true/.test(service)) {
    p.push("service: Step 1 zero → Step 2 must set auto_widened: true");
  }
  if (/window_step === 3|step3|Step 3/.test(service) && /auto_widened/.test(service)) {
    // allow comment about never past step 2
    if (/auto_widened[\s\S]{0,80}step:\s*3/.test(service)) {
      p.push("service: must never auto-advance past step 2");
    }
  }
  if (!/hasExplicitDates/.test(service) || !/step:\s*"custom"/.test(service)) {
    p.push("service: explicit From/To must bypass cascade (step custom)");
  }
  // Custom From/To: no span cap (ROUND 156 §2 Step 3).
  if (/MAX_CUSTOM_SPAN_DAYS/.test(service) && /clampCustomSpan[\s\S]{0,400}MAX_CUSTOM_SPAN_DAYS/.test(service)) {
    p.push("service: custom From/To must not truncate to MAX_CUSTOM_SPAN_DAYS");
  }

  if (!/export function payeeSimilarity\(/.test(service)) p.push("service: payeeSimilarity() missing");
  if (!/const payeeSim = payeeSimilarity\(txnMemo, candidate\.counterparty_name\);/.test(service)) p.push("service: findCandidates does not score the payee name");
  if (!/SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN/.test(service)) {
    p.push("service: bill_payments must be gated by SQL_BILL_PAYMENT_IS_CASH_SETTLEMENT_BORN");
  }
  if (!/SQL_BILL_IS_SETTLEMENT_BORN/.test(service)) {
    p.push("service: bills must be gated by SQL_BILL_IS_SETTLEMENT_BORN");
  }
  if (!/SETTLEMENT-BORN CANDIDATE UNIVERSE/i.test(predicate)) {
    p.push("predicate: missing SETTLEMENT-BORN definition header");
  }
  if (!/BUILD NO TYPE FILTER/i.test(predicate)) {
    p.push("predicate: must lock BUILD NO TYPE FILTER");
  }

  // Forbidden sources in fetchLedgerCandidates (not loadLedgerAmountCents).
  const fetchStart = service.indexOf("async function fetchLedgerCandidates");
  if (fetchStart < 0) p.push("service: fetchLedgerCandidates missing");
  else {
    const after = service.slice(fetchStart);
    const fetchEnd = after.indexOf("\nasync function loadLedgerAmountCents");
    const body = fetchEnd > 0 ? after.slice(0, fetchEnd) : after.slice(0, 4500);
    // LEAD 443.168 N (register 1.4: the universe is every document — superseding ROUND 157-C / #22960, which removed transfers
    // and journal entries with the settlement-born-only scope): transfers and manual journal entries ARE sources now, each
    // scoped to the line's account (SCOPED_SOURCES) and excluded once matched (verify-bank-match-no-double-match-all-six-kinds).
    if (!/FROM banking\.transfers\b/i.test(body) || !/FROM accounting\.journal_entries\b/i.test(body))
      p.push("service: transfers and manual journal entries must be candidate sources (443.168 N)");
  }

  if (!/window_step: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(2\)/.test(route)) {
    p.push("route: must accept window_step (1|2)");
  }
  if (/search_all/.test(route) && /365/.test(route)) {
    p.push("route: search_all → 365 must be removed from the default path");
  }

  if (!/params\.set\("window_step"/.test(api)) p.push('api: getMatchCandidates must forward window_step');
  for (const q of ['params.set("payee"', 'params.set("date_from"', 'params.set("date_to"', 'params.set("amount_min"', 'params.set("amount_max"']) {
    if (!api.includes(q)) p.push(`api: getMatchCandidates does not forward ${q}`);
  }

  // LEAD 443.163 (register M3/M5): ONE matcher on the banking surface — the Categorize / Match popup embeds MatchDrawer.
  // The QuickBooks Find-match requirements this guard held on the old inline table now live on that one matcher.
  if (/getMatchCandidates\(/.test(view)) p.push("view: the banking view queries match candidates itself — a second matcher (register M3)");
  if (!/<MatchDrawer\s+embedded\b/.test(view)) p.push("view: Categorize / Match must embed the one matcher (<MatchDrawer embedded …>) (register M3)");
  if (/Search all|inline-match-search-all|±7 days|days_before \?\? 90/.test(view)) {
    p.push('view: must remove "Search all" / ±7 / 90-day copy');
  }
  for (const id of ["match-drawer-qbo-filters", "match-filter-payee", "match-date-from", "match-date-to", "match-filter-amount-min", "match-filter-amount-max", "match-drawer-record-type-dropdown"]) {
    if (!drawer.includes(`data-testid="${id}"`)) p.push(`drawer: filter control ${id} missing (register M5)`);
  }
  if (!/payee: payeeQ\.trim\(\) \|\| undefined/.test(drawer) || !/amountMin: amountMin \?\? undefined/.test(drawer) || !/amountMax: amountMax \?\? undefined/.test(drawer))
    p.push("drawer: Payee / Amount from / Amount to are not sent to getMatchCandidates (register M5)");
  for (const id of ["match-candidate-payee", "match-candidate-difference", "match-candidate-days-off", "match-candidate-date"]) {
    if (!drawer.includes(`data-testid="${id}"`)) p.push(`drawer: candidate rows do not show ${id}`);
  }
  // D070 / row 189 — candidate list dates must be formatDateUS (MM/DD/YYYY), never ISO slice display.
  if (!/formatDateUS\(\s*c\.event_date\s*\)/.test(drawer)) {
    p.push("drawer: match-candidate-date must use formatDateUS(c.event_date) (D070 MM/DD/YYYY)");
  }
  if (/match-candidate-date">Date: \{String\(c\.event_date/.test(drawer) || /event_date \?\? ""\)\.slice\(0,\s*10\)/.test(drawer)) {
    p.push("drawer: match-candidate-date must not render raw YYYY-MM-DD via String(...).slice(0,10) (D070)");
  }
  // D071 / row 190 — candidate payee labels proper-cased (ALL CAPS → Title Case; mixed case kept).
  if (!/formatPersonName\(\s*c\.counterparty_name\s*\)/.test(drawer)) {
    p.push("drawer: match-candidate-payee must use formatPersonName(c.counterparty_name) (D071)");
  }
  if (/Gap \(\$/.test(drawer) || />Gap</.test(drawer) || /Amount gap:/.test(drawer)) {
    p.push('drawer: "Gap" text is back — it must read Difference and Days off');
  }

  if (/match-search-all|Search all|±7 days/.test(drawer)) {
    p.push('drawer: must remove "Search all" / ±7 copy');
  }
  if (!/match-window-header|match-search-7-days|match-window-widened-banner|match-from-to/.test(drawer)) {
    p.push("drawer: must have window header, Search 7 days, widen banner, From/To");
  }

  return p;
}

function selftest() {
  const base = readAll();
  const baseline = problemsFor(base);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST: baseline not clean:`, baseline);
    process.exit(1);
  }
  const mutants = [
    ["resurrect QBO 90", { ...base, service: base.service.replace("export const MATCH_WINDOW_STEPS", "export const QBO_DAYS_BEFORE = 90;\nexport const MATCH_WINDOW_STEPS") }],
    ["step1 wrong bounds", { ...base, service: base.service.replace("step1: { before: 3, after: 1 }", "step1: { before: 90, after: 20 }") }],
    // ROUND 369.2 retired the "no expenses / no AR payments" rule; the mutant that guards a live rule takes its place.
    ["transfers dropped", { ...base, service: base.service.replace("FROM banking.transfers t", "FROM banking.transfer_x t") }],
    ["relay fill on every register", { ...base, service: base.service.replace('if (onRelayWallet && wants("relay_fuel"))', 'if (wants("relay_fuel"))') }],
    ["je not scoped to the ledger", { ...base, service: base.service.replace("AND p.account_id = $6::uuid", "AND true") }],
    ["second matcher in the view", { ...base, view: base.view + "\nvoid getMatchCandidates(a, b, {});\n" }],
    ["amount filter not sent", { ...base, drawer: base.drawer.replace("amountMin: amountMin ?? undefined,", "") }],
    ["payee filter control gone", { ...base, drawer: base.drawer.replace('data-testid="match-filter-payee"', 'data-testid="x"') }],
    ["expense company-wide", { ...base, service: base.service.replace("AND e.payment_account_uuid = $6::uuid", "") }],
    ["payment company-wide", { ...base, service: base.service.replace("p.deposited_to_account_id::text = $6::text", "TRUE") }],
    ["bill payment company-wide", { ...base, service: base.service.replace("bp.from_bank_account_id = $6::uuid", "TRUE") }],
    ["relay deposit on every register", { ...base, service: base.service.replace('if (onRelayWallet && wants("relay_deposit"))', 'if (wants("relay_deposit"))') }],
    ["bills on card registers", { ...base, service: base.service.replace('if (onOperatingBank && wants("bill"))', 'if (wants("bill"))') }],
    ["factoring purchases dropped", { ...base, service: base.service.replace("FROM accounting.factoring_purchases fp", "FROM accounting.factoring_advances fp") }],
    ["invoices dropped", { ...base, service: base.service.replace('if (onOperatingBank && wants("invoice"))', "if (false)") }],
    ["faro never suggested", { ...base, route: base.route.replace('if (c.ledger_entry_kind === "factoring_advance") return c.exact_amount;', "") }],
    ["no reason", { ...base, route: base.route.replaceAll("suggested_reason:", "suggested_note:") }],
    ["2150 served on a purchased wire", { ...base, feed: base.feed.replace("FROM accounting.factoring_purchases fp", "FROM accounting.factoring_advances fp") }],
    ["consumed expense offered", { ...base, service: base.service.replace("WHERE cbt.matched_expense_id = e.id AND cbt.voided_at IS NULL", "WHERE false") }],
    ["bank-born expense offered", { ...base, service: base.service.replace("AND e.source_bank_transaction_id IS NULL", "") }],
    ["consumed payment offered", { ...base, service: base.service.replace("WHERE cbt.matched_payment_id = p.id AND cbt.voided_at IS NULL", "WHERE false") }],
    ["no relevance floor", { ...base, service: base.service.replace(".filter((c) => explicitSearch || passesRelevanceFloor(c))", "") }],
    ["floor ignores similarity", { ...base, service: base.service.replace("input.amountGapCents <= input.toleranceCents || input.similarity >= AUTO_MATCH_MEMO_SIMILARITY_MIN", "input.amountGapCents <= input.toleranceCents") }],
    // 443.168 J
    ["described payee writes a categorization", { ...base, engine: base.engine.replace("suggested_customer_id = $3::uuid,", "suggested_customer_id = $3::uuid,\n        categorized_at = now(),") }],
    ["described payee without reason", { ...base, engine: base.engine.replace("suggested_confidence = 'medium',\n        suggested_source = $5,\n        suggested_reason = $6,", "suggested_confidence = 'medium',\n        suggested_source = $5,") }],
    ["described payee overwrites a rule", { ...base, engine: base.engine.replace("AND (suggested_source IS NULL OR suggested_source LIKE 'description_payee:%' OR suggested_source LIKE 'fuzzy_vendor_match:%')", "") }],
    ["money-in pass dropped", { ...base, engine: base.engine.replace("AND categorized_at IS NULL AND is_credit = true", "AND false") }],
    ["plaid ingest skips suggestion", { ...base, plaid: base.plaid.replace("await suggestForBankTransaction(", "await applyBankingRulesForTransaction(") }],
    ["relay ingest skips suggestion", { ...base, relay: base.relay.replace("await suggestForBankTransaction(", "void (") }],
    ["tie suggested", { ...base, payee: base.payee.replace("if (scored.length > 1 && scored[1]!.score === scored[0]!.score) return null;", "") }],
    ["zelle unread", { ...base, payee: base.payee.replace('return { pattern: "zelle_to"', 'return { pattern: "zelle_x"') }],
    ["reason hidden", { ...base, view: base.view.replace('data-testid="bank-txn-suggested-reason"', 'data-testid="x"') }],
    // 443.168 K
    ["E-47 not raised on match", { ...base, service: base.service.replace("await raiseMisdirectedPaymentAlerts(client", "void (client") }],
    ["E-47 posts", { ...base, e47: base.e47 + "\n// INSERT INTO accounting.journal_entries\n" }],
    ["E-47 on money out", { ...base, e47: base.e47.replace("if (!line || !line.is_credit) return", "if (!line) return") }],
    ["E-47 calendar day", { ...base, e47: base.e47.replace("return nextBusinessDay(next)", "return (next)") }],
    ["E-47 deadline hidden", { ...base, view: base.view.replace('data-testid="bank-txn-misdirected-alert"', 'data-testid="x"') }],
    ["new unscoped source", { ...base, service: base.service.replace('if (onOperatingBank && wants("invoice"))', 'if (wants("settlement")) {}\n    if (onOperatingBank && wants("invoice"))') }],
    // 443.343-C
    ["suggestion actions gone", { ...base, view: base.view.replace('data-testid="bank-txn-suggestion-actions"', 'data-testid="x"') }],
    ["confidence hidden", { ...base, view: base.view.replace('data-testid="bank-txn-suggested-confidence"', 'data-testid="x"') }],
    ["source hidden", { ...base, view: base.view.replace('data-testid="bank-txn-suggested-source"', 'data-testid="x"') }],
    ["who-when hidden", { ...base, view: base.view.replace('data-testid="bank-txn-categorized-who-when"', 'data-testid="x"') }],
    ["reject route gone", { ...base, categorize: base.categorize.replace("/reject-suggestion", "/reject-x") }],
    ["accept-all resurrected", { ...base, queue: base.queue + '\n<button data-testid="needs-categorizing-accept-all">Accept all</button>\n' }],
  ];
  for (const [name, mutant] of mutants) {
    const hits = problemsFor(mutant);
    if (!hits.length) {
      console.error(`${LABEL} SELFTEST: mutant "${name}" did not fail`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest: PASS (${mutants.length} mutants)`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const problems = problemsFor(readAll());
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of problems) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
