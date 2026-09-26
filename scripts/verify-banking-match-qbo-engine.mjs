#!/usr/bin/env node
/**
 * verify-banking-match-qbo-engine — BANK-MATCH-QBO filters + ROUND 207 date cascade
 * (owner 2026-09-23 LOCKED: 3 days → 7 days → From/To; never 90/20; never search_all→365).
 *
 * Usage: node scripts/verify-banking-match-qbo-engine.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const FILES = {
  service: "apps/backend/src/accounting/bank-recon/match.service.ts",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
  api: "apps/frontend/src/api/banking.ts",
  view: "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
};
const LABEL = "verify-banking-match-qbo-engine";
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function problemsFor({ service, route, api, view, drawer }) {
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
  if (!/Never advances past Step 2|never past Step 2|Never auto-advance past Step 2/i.test(service)) {
    // Accept code structure: no step3 / no third fetch after step2
    if (/window_step === 3|step3|Step 3/.test(service)) {
      p.push("service: must never auto-advance past step 2");
    }
  }
  // Never auto-advance past step 2 — no step-3 widen path
  if (/auto_widened[\s\S]{0,80}step:\s*3|step3.*auto_widened/.test(service)) {
    p.push("service: must never auto-advance past step 2 (found step-3 widen)");
  }
  // Explicit From/To bypasses cascade
  if (!/hasExplicitDates/.test(service) || !/step:\s*"custom"/.test(service)) {
    p.push("service: explicit From/To must bypass cascade (step custom)");
  }

  if (!/export function payeeSimilarity\(/.test(service)) p.push("service: payeeSimilarity() missing");
  if (!/const payeeSim = payeeSimilarity\(txnMemo, candidate\.counterparty_name\);/.test(service)) p.push("service: findCandidates does not score the payee name");
  if (!/const similarity = Math\.max\([\s\S]{0,200}payeeSim[\s\S]{0,20}\);/.test(service)) p.push("service: similarity must be the max of memo / description / payee");
  if (!/FROM accounting\.payments p\s+LEFT JOIN mdata\.customers c ON c\.id = p\.customer_id/.test(service)) p.push("service: payments must join mdata.customers");
  if (!/FROM accounting\.bill_payments bp\s+LEFT JOIN mdata\.vendors v/.test(service)) p.push("service: bill_payments must join mdata.vendors");
  if (!/FROM accounting\.bills b\s+LEFT JOIN mdata\.vendors v/.test(service)) p.push("service: bills must join mdata.vendors");
  if (!/FROM accounting\.expenses e\s+LEFT JOIN mdata\.vendors v ON v\.id = e\.vendor_uuid/.test(service)) p.push("service: expenses must join mdata.vendors");
  for (const f of ["kinds", "payee", "dateFrom", "dateTo", "amountMinCents", "amountMaxCents"]) {
    if (!new RegExp(`^\\s*${f}\\?:`, "m").test(service)) p.push(`service: CandidateFilters lacks ${f}`);
  }
  if (!/payeeNeedle && !\(row\.counterparty_name \?\? ""\)\.toLowerCase\(\)\.includes\(payeeNeedle\)/.test(service)) p.push("service: payee filter not applied");
  if (!/options\.amountMinCents != null && row\.amount_cents < options\.amountMinCents/.test(service)) p.push("service: amount-from filter not applied");

  // Route — window_step; no search_all → 365
  if (/search_all/.test(route) && /365/.test(route)) {
    p.push("route: search_all → 365 must be removed from the default path");
  }
  if (!/window_step: z\.coerce\.number\(\)\.int\(\)\.min\(1\)\.max\(2\)/.test(route)) {
    p.push("route: must accept window_step (1|2)");
  }
  for (const q of ["kinds: z", "payee: z.string", "date_from: z.string", "date_to: z.string", "amount_min: z.coerce", "amount_max: z.coerce"]) {
    if (!route.includes(q)) p.push(`route: query schema lacks ${q}`);
  }
  if (!/kinds: parsed\.data\.kinds,\s*payee: parsed\.data\.payee,/.test(route)) p.push("route: filters not passed to findCandidates");

  // API
  if (/search_all|searchAll/.test(api) && /getMatchCandidates/.test(api)) {
    // searchAll must be gone from getMatchCandidates
    const apiFn = api.slice(api.indexOf("export function getMatchCandidates"));
    if (/search_all|searchAll|windowDays/.test(apiFn.slice(0, 1200))) {
      p.push("api: getMatchCandidates must not send search_all / window_days");
    }
  }
  if (!/params\.set\("window_step"/.test(api)) p.push('api: getMatchCandidates must forward window_step');
  for (const q of ['params.set("kinds"', 'params.set("payee"', 'params.set("date_from"', 'params.set("date_to"', 'params.set("amount_min"', 'params.set("amount_max"']) {
    if (!api.includes(q)) p.push(`api: getMatchCandidates does not forward ${q}`);
  }

  // View filters (existing)
  for (const id of ["banking-match-filters", "banking-match-filter-kind", "banking-match-filter-payee", "banking-match-filter-date-from", "banking-match-filter-date-to", "banking-match-filter-amount-min", "banking-match-filter-amount-max"]) {
    if (!view.includes(`data-testid="${id}"`)) p.push(`view: filter control ${id} missing`);
  }
  if (!view.includes('data-testid="banking-match-candidate-payee"')) p.push("view: candidate rows do not show the Payee");
  if (!/getMatchCandidates\(String\(expandedTxId\), companyId, \{[\s\S]{0,500}kinds: matchKinds\.size >= ALL_MATCH_KINDS\.length \? undefined : \[\.\.\.matchKinds\],[\s\S]{0,300}payee: matchPayee \|\| undefined,/.test(view)) {
    p.push("view: filters are not sent to the query");
  }
  if (/Search all|inline-match-search-all|±7 days|days_before \?\? 90/.test(view)) {
    p.push('view: must remove "Search all" / ±7 / 90-day copy');
  }
  if (!/banking-match-search-7-days|Within 3 days/.test(view)) {
    p.push("view: must surface Within 3 days / Search 7 days cascade UI");
  }

  // Drawer
  if (/match-search-all|Search all|±7 days/.test(drawer)) {
    p.push('drawer: must remove "Search all" / ±7 copy');
  }
  if (!/match-window-header|match-search-7-days|match-window-widened-banner|match-from-to/.test(drawer)) {
    p.push("drawer: must have window header, Search 7 days, widen banner, From/To");
  }

  if (!/<ParityTable\b/.test(view) || !/gearButtonTestId="banking-match-gear"/.test(view)) {
    p.push("view: the match-candidates register must be a real ParityTable with its own gear (column show/hide, drag-resize, drag-reorder)");
  }
  if (/<select\b[\s\S]{0,80}data-testid="banking-match-filter-kind"/.test(view)) {
    p.push("view: Show reverted to a single-select <select> — it must be a multi-select checklist");
  }
  if (!/MultiSelectDropdown/.test(view) || !/data-testid="banking-match-filter-kind-dropdown"/.test(view)) {
    p.push("view: Show must be MultiSelectDropdown (banking-match-filter-kind-dropdown)");
  }
  const allKindsLine = view.match(/const ALL_MATCH_KINDS: BankMatchCandidateKind\[\] = \[[^\]]*\];/)?.[0] ?? "";
  for (const kind of ["bill", "bill_payment", "expense", "payment", "transfer", "je"]) {
    if (!allKindsLine.includes(`"${kind}"`)) {
      p.push(`view: Show checklist is missing the ${kind} option`);
    }
  }
  if (/Gap \(\$/.test(view) || />Gap</.test(view)) {
    p.push('view: "Gap" column text is back — it must be split into Difference and Days off');
  }
  if (!view.includes('label: "Difference"') || !view.includes('label: "Days off"')) {
    p.push("view: candidate columns must carry Difference and Days off (Gap's signed replacement)");
  }
  return p;
}

function selftest() {
  const base = {
    service: read(FILES.service),
    route: read(FILES.route),
    api: read(FILES.api),
    view: read(FILES.view),
    drawer: read(FILES.drawer),
  };
  const baseline = problemsFor(base);
  if (baseline.length) { console.error(`${LABEL} SELFTEST: baseline not clean:`, baseline); process.exit(1); }
  const mutants = [
    ["resurrect QBO 90", { ...base, service: base.service.replace("export const MATCH_WINDOW_STEPS", "export const QBO_DAYS_BEFORE = 90;\nexport const MATCH_WINDOW_STEPS") }],
    ["step1 wrong bounds", { ...base, service: base.service.replace("step1: { before: 3, after: 1 }", "step1: { before: 90, after: 20 }") }],
    ["step-3 auto-widen", { ...base, service: base.service + "\n// mutant\nconst step3 = { auto_widened: true, step: 3 };\n" }],
    ["search_all 365 back", { ...base, route: base.route.replace("window_step:", "search_all: z.literal(\"1\").optional(),\n        window_days: z.coerce.number().optional(), // 365\n        window_step:") }],
    ["payee signal dropped from similarity", { ...base, service: base.service.replace("const payeeSim = payeeSimilarity(txnMemo, candidate.counterparty_name);", "const payeeSim = 0;") }],
    ["expenses lose the vendor join", { ...base, service: base.service.replace("LEFT JOIN mdata.vendors v ON v.id = e.vendor_uuid", "") }],
    ["payee filter ignored", { ...base, service: base.service.replace('payeeNeedle && !(row.counterparty_name ?? "").toLowerCase().includes(payeeNeedle)', "false") }],
    ["route drops amount_max", { ...base, route: base.route.replace("amount_max: z.coerce.number().min(0).optional(),", "") }],
    ["api forgets kinds", { ...base, api: base.api.replace('params.set("kinds", opts.kinds.join(","));', "") }],
    ["Show dropdown removed", { ...base, view: base.view.replace('data-testid="banking-match-filter-kind"', "") }],
    ["Payee column removed", { ...base, view: base.view.replace('data-testid="banking-match-candidate-payee"', "") }],
    ["filters not sent", { ...base, view: base.view.replace("kinds: matchKinds.size >= ALL_MATCH_KINDS.length ? undefined : [...matchKinds],", "") }],
    ["gear removed", { ...base, view: base.view.replace('gearButtonTestId="banking-match-gear"', "") }],
    ["drawer Search all back", { ...base, drawer: base.drawer + '\n<button data-testid="match-search-all">Search all</button>\n' }],
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
  route: read(FILES.route),
  api: read(FILES.api),
  view: read(FILES.view),
  drawer: read(FILES.drawer),
});
if (problems.length) {
  console.error(`${LABEL}: FAIL`);
  for (const x of problems) console.error(`  ✗ ${x}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — QBO filters + ROUND 207 date cascade (3→7→From/To)`);
process.exit(0);
