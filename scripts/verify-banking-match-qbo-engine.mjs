#!/usr/bin/env node
/**
 * verify-banking-match-qbo-engine — ROUND 157-C / 156 MASTER SPEC
 * Settlement-born only + date cascade 3→7→From/To. BUILD NO TYPE FILTER.
 * (Formerly asserted a Show multi-select of six kinds — that was WITHDRAWN by owner 2026-09-28.)
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
};
const LABEL = "verify-banking-match-qbo-engine";
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function problemsFor({ service, predicate, route, api, view, drawer }) {
  const p = [];
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
    // ROUND 369.2 (Lead ruling, 2026-10-03): "QBO parity wins. ROUND 157-C is superseded" — any open document of a
    // matchable type is a candidate, so customer payments and expenses are no longer forbidden here (that contract is
    // asserted by verify-bank-match-candidate-sources). Transfers and journal entries stay out: #22960 removed them as
    // candidates on purpose and verify-bank-match-no-double-match-all-six-kinds names why.
    for (const [re, name] of [
      [/FROM accounting\.journal_entries\b/i, "journal_entries"],
      [/FROM banking\.transfers\b/i, "transfers"],
    ]) {
      if (re.test(body)) p.push(`service: fetchLedgerCandidates must NOT select ${name}`);
    }
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

  // View — NO type filter (BUILD NO TYPE FILTER)
  if (/banking-match-filter-kind-dropdown|banking-match-filter-kind"/.test(view) && /MultiSelectDropdown/.test(view)) {
    p.push("view: type Show filter must be removed (BUILD NO TYPE FILTER)");
  }
  if (/kinds:\s*matchKinds/.test(view) || /kinds: \[/.test(view.slice(view.indexOf("getMatchCandidates")))) {
    const chunk = view.slice(view.indexOf("getMatchCandidates"), view.indexOf("getMatchCandidates") + 800);
    if (/kinds:/.test(chunk)) p.push("view: must not send kinds to getMatchCandidates");
  }
  for (const id of ["banking-match-filters", "banking-match-filter-payee", "banking-match-filter-date-from", "banking-match-filter-date-to", "banking-match-filter-amount-min", "banking-match-filter-amount-max"]) {
    if (!view.includes(`data-testid="${id}"`)) p.push(`view: filter control ${id} missing`);
  }
  if (!view.includes('data-testid="banking-match-candidate-payee"')) p.push("view: candidate rows do not show the Payee");
  if (!/banking-match-search-7-days|Within 3 days/.test(view)) {
    p.push("view: must surface Within 3 days / Search 7 days cascade UI");
  }
  if (!/banking-match-settlement-born-note|Settlement-born/.test(view)) {
    p.push("view: must declare settlement-born-only scope to the operator");
  }
  if (/Search all|inline-match-search-all|±7 days|days_before \?\? 90/.test(view)) {
    p.push('view: must remove "Search all" / ±7 / 90-day copy');
  }
  if (!/<ParityTable\b/.test(view) || !/gearButtonTestId="banking-match-gear"/.test(view)) {
    p.push("view: the match-candidates register must be a real ParityTable with its own gear");
  }
  if (/Gap \(\$/.test(view) || />Gap</.test(view)) {
    p.push('view: "Gap" column text is back — it must be split into Difference and Days off');
  }
  if (!view.includes('label: "Difference"') || !view.includes('label: "Days off"')) {
    p.push("view: candidate columns must carry Difference and Days off");
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
  const base = {
    service: read(FILES.service),
    predicate: read(FILES.predicate),
    route: read(FILES.route),
    api: read(FILES.api),
    view: read(FILES.view),
    drawer: read(FILES.drawer),
  };
  const baseline = problemsFor(base);
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST: baseline not clean:`, baseline);
    process.exit(1);
  }
  const mutants = [
    ["resurrect QBO 90", { ...base, service: base.service.replace("export const MATCH_WINDOW_STEPS", "export const QBO_DAYS_BEFORE = 90;\nexport const MATCH_WINDOW_STEPS") }],
    ["step1 wrong bounds", { ...base, service: base.service.replace("step1: { before: 3, after: 1 }", "step1: { before: 90, after: 20 }") }],
    // ROUND 369.2 retired the "no expenses / no AR payments" rule; the mutant that guards a live rule takes its place.
    ["transfers back", { ...base, service: base.service.replace("async function fetchLedgerCandidates", "async function fetchLedgerCandidates() {\n FROM banking.transfers t\n}\nasync function fetchLedgerCandidates_OLD") }],
    ["type filter back", { ...base, view: base.view + `\n<div data-testid="banking-match-filter-kind"><MultiSelectDropdown data-testid="banking-match-filter-kind-dropdown"/></div>\n` }],
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

const problems = problemsFor({
  service: read(FILES.service),
  predicate: read(FILES.predicate),
  route: read(FILES.route),
  api: read(FILES.api),
  view: read(FILES.view),
  drawer: read(FILES.drawer),
});
if (problems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const x of problems) console.error(`  - ${x}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
