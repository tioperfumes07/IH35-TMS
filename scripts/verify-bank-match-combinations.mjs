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
 *  R6 (443.305) the rest of a multi-document match can be a LOAN DOCUMENT: party resolved from related_party_accounts, GL through
 *     the one variance poster with the party on its line, the document through createRelatedPartyLoanEntry
 *     (bank_funding in / bank_repayment out), and a bank line BELOW the documents is refused.
 *  R7 (443.305) the accept-multi-match route passes difference_as_loan; R8 the Match drawer sends it.
 *  R9 the loan document is created AFTER the match's compare-and-swap clear (banking.bank_line_classify flips review_state
 *     to 'matched' the moment matched_related_party_loan_id is stamped — created first, the clear refuses the match).
 *  R10 unmatch reverses a loan document THIS match created (audit-event scoped) and clears its pointer.
 * --selftest plants each regression and requires a FAIL.
 */
import fs from "node:fs";
const LABEL = "verify-bank-match-combinations";
const F = {
  match: "apps/backend/src/accounting/bank-recon/match.service.ts",
  route: "apps/backend/src/banking/p7-wave2.routes.ts",
  recon: "apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts",
  drawer: "apps/frontend/src/pages/banking/components/MatchDrawer.tsx",
  unmatch: "apps/backend/src/accounting/bank-recon/unmatch-bank-transaction.service.ts",
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
  const loan = multi.slice(multi.indexOf("input.difference_as_loan?.party_account_id"), multi.indexOf("input.difference_as_loan?.party_account_id") + 4500);
  if (!/difference_as_loan_requires_bank_above_documents/.test(loan) || !/FROM accounting\.related_party_accounts r/.test(loan) ||
      !/difference_entity: \{ entity_uuid: party\.party_vendor_id, entity_type: "vendor" \}/.test(loan) ||
      !/createRelatedPartyLoanEntry\(/.test(loan) || !/"bank_funding" : "bank_repayment"/.test(loan))
    v.push("R6 rest-as-loan does not post through the variance poster with the party AND create the loan document (bank_funding / bank_repayment), or accepts a bank line below the documents");
  const posterFull = m.slice(m.indexOf("async function postDifferenceJournalEntry("), m.indexOf("async function postDifferenceJournalEntry(") + 12000);
  if (!/leg\.seq === 2 && input\.difference_entity/.test(posterFull)) v.push("R6 variance poster does not stamp the party on the offset leg");
  if (!/difference_as_loan:[\s\S]{0,300}party_account_id: v/.test(src.recon)) v.push("R7 accept-multi-match route drops difference_as_loan");
  if (!/difference_as_loan: \{ party_account_id: restAsLoanAccountId \}/.test(src.drawer)) v.push("R8 Match drawer never sends difference_as_loan");
  const clearAt = multi.indexOf('if (cleared.rowCount === 0) throw new Error("bank_transaction_already_matched");');
  const callAt = multi.indexOf("if (createLoanDocumentAfterClear) await createLoanDocumentAfterClear();");
  if (clearAt < 0 || callAt < clearAt || !/createLoanDocumentAfterClear = async \(\) => \{[\s\S]{0,400}createRelatedPartyLoanEntry\(/.test(multi))
    v.push("R9 the loan document is not created after the match clears the bank line");
  if (!/event_class = 'bank_match\.multi_difference_as_loan'/.test(src.unmatch) || !/SET status = 'reversed', reversed_at = now\(\)/.test(src.unmatch) ||
      !/SET matched_related_party_loan_id = NULL/.test(src.unmatch))
    v.push("R10 unmatch does not reverse the loan document this match created / clear its pointer");
  return v;
}
const src = {
  match: fs.readFileSync(F.match, "utf8"), route: fs.readFileSync(F.route, "utf8"),
  recon: fs.readFileSync(F.recon, "utf8"), drawer: fs.readFileSync(F.drawer, "utf8"),
  unmatch: fs.readFileSync(F.unmatch, "utf8"),
};
if (process.argv.includes("--selftest")) {
  if (check(src).length) { console.error(`${LABEL} SELFTEST FAIL: clean tree rejected: ${check(src).join("; ")}`); process.exit(1); }
  const plants = [
    ["R1 deposit exclusion removed", { ...src, match: src.match.replace("WHERE dl.source_factoring_advance_id = fp.factoring_advance_id", "WHERE false") }],
    ["R2 pool after floor", { ...src, match: src.match.replace("findAmountCombinations(\n        txnAmountAbs,\n        lastPool", "findAmountCombinations(\n        txnAmountAbs,\n        candidates") }],
    ["R3 route drops", { ...src, route: src.route.replace("combinations: result.combinations", "") }],
    ["R4 multi difference removed", { ...src, match: src.match.replace("varianceCents !== 0 && input.difference_account_id)", "varianceCents !== 0 && false)") }],
    ["R5 account check removed", { ...src, match: src.match.replace("difference_account_not_postable_in_company", "x") }],
    ["R6 loan document dropped", { ...src, match: src.match.replace("const loan = await createRelatedPartyLoanEntry(", "const loan = await noDocument(") }],
    ["R6 negative rest accepted", { ...src, match: src.match.replace("difference_as_loan_requires_bank_above_documents", "x") }],
    ["R6 party not on leg", { ...src, match: src.match.replace("leg.seq === 2 && input.difference_entity", "false") }],
    ["R7 route drops loan", { ...src, recon: src.recon.replace("party_account_id: v }", "x: v }") }],
    ["R9 loan before clear", { ...src, match: src.match.replace("    if (createLoanDocumentAfterClear) await createLoanDocumentAfterClear();\n", "").replace("let createLoanDocumentAfterClear: (() => Promise<void>) | null = null;", "let createLoanDocumentAfterClear: (() => Promise<void>) | null = null; if (createLoanDocumentAfterClear) await createLoanDocumentAfterClear();") }],
    ["R10 unmatch leaves loan", { ...src, unmatch: src.unmatch.replace("SET status = 'reversed', reversed_at = now()", "SET status = status") }],
    ["R8 drawer drops loan", { ...src, drawer: src.drawer.replace("difference_as_loan: { party_account_id: restAsLoanAccountId }", "x: 1") }],
  ];
  for (const [l, p] of plants) if (!check(p).length) { console.error(`${LABEL} SELFTEST FAIL: plant escaped — ${l}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length}/${plants.length}`); process.exit(0);
}
const v = check(src);
if (v.length) { console.error(`${LABEL}: FAIL\n  ${v.join("\n  ")}`); process.exit(1); }
console.log(`${LABEL}: PASS — G1 deposit exclusion, pre-floor combinations returned + routed, multi-document Resolve difference, company-checked difference account, rest of a line as a related-party loan document`);
