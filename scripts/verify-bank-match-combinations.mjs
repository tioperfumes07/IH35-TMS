#!/usr/bin/env node
/**
 * LEAD 443.304 — bank matching: one bank line ↔ several documents (owner 10-24 08:55 CT: a wire can carry several Faro
 * purchases; one deposit can be a purchase + a loan; the human selects several and resolves differences).
 * Asserts, in source:
 *  R1 G1 — a Faro purchase already on a live Deposit is never offered on its own (matched THROUGH the deposit).
 *  R2 combinations are searched over the full pool BEFORE the single-document relevance floor, and returned.
 *  R3 the match-candidates route passes combinations through.
 *  R4 a multi-document accept resolves a difference through the one variance poster (postDifferenceJournalEntry).
 *  R5 the variance poster refuses a difference account that is not this company's live, postable account.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
const LABEL = "verify-bank-match-combinations";
const F = {
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
};
export function check(src) {
  const v = [];
  const m = src.match, r = src.route;
  const fp = m.slice(m.indexOf("FROM accounting.factoring_purchases fp"), m.indexOf("FROM accounting.factoring_purchases fp") + 2500);
  if (!/dl\.source_factoring_advance_id\s*=\s*fp\.factoring_advance_id/.test(fp)) v.push("R1 purchase candidates do not exclude purchases already on a live deposit");
  if (!/lastPool = rawCandidates/.test(m) || !/findAmountCombinations\(\s*txnAmountAbs,\s*lastPool/.test(m)) v.push("R2 combinations are not searched over the pre-floor pool");
  if (!/combinations\b[^\n]*\n?[^\n]*\};?/.test(m) || !/bank_amount_cents: txnAmountAbs, combinations/.test(m)) v.push("R2 findCandidates does not return combinations");
  if (!/combinations: result\.combinations/.test(r)) v.push("R3 match-candidates route drops combinations");
  const multi = m.slice(m.indexOf("export async function acceptExactMultiDocumentMatch"));
  if (!/varianceCents !== 0 && input\.difference_account_id\)[\s\S]{0,400}postDifferenceJournalEntry\(/.test(multi)) v.push("R4 multi-document accept cannot resolve a difference through postDifferenceJournalEntry");
  const poster = m.slice(m.indexOf("async function postDifferenceJournalEntry("), m.indexOf("async function postDifferenceJournalEntry(") + 4000);
  if (!/difference_account_not_postable_in_company/.test(poster) || !/operating_company_id = \$2::uuid AND deactivated_at IS NULL/.test(poster)) v.push("R5 variance poster does not check the difference account's company / active / postable");
  return v;
}
const src = { match: fs.readFileSync(F.match, "utf8"), route: fs.readFileSync(F.route, "utf8") };
if (process.argv.includes("--selftest")) {
  if (check(src).length) { console.error(`${LABEL} SELFTEST FAIL: clean tree rejected: ${check(src).join("; ")}`); process.exit(1); }
  const plants = [
    ["R1 deposit exclusion removed", { ...src, match: src.match.replace("WHERE dl.source_factoring_advance_id = fp.factoring_advance_id", "WHERE false") }],
    ["R2 pool after floor", { ...src, match: src.match.replace("findAmountCombinations(\n        txnAmountAbs,\n        lastPool", "findAmountCombinations(\n        txnAmountAbs,\n        candidates") }],
    ["R3 route drops", { ...src, route: src.route.replace("combinations: result.combinations", "") }],
    ["R4 multi difference removed", { ...src, match: src.match.replace("varianceCents !== 0 && input.difference_account_id)", "varianceCents !== 0 && false)") }],
    ["R5 account check removed", { ...src, match: src.match.replace("difference_account_not_postable_in_company", "x") }],
  ];
  for (const [l, p] of plants) if (!check(p).length) { console.error(`${LABEL} SELFTEST FAIL: plant escaped — ${l}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`); process.exit(0);
}
const v = check(src);
if (v.length) { console.error(`${LABEL}: FAIL\n  ${v.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — G1 deposit exclusion, pre-floor combinations returned + routed, multi-document Resolve difference, company-checked difference account`);
