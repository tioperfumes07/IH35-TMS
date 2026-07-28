/**
 * ONE definition of "this contract is validly signed", for every gate that reads
 * legal.contract_instances.
 *
 * WHY THIS FILE EXISTS. The predicate was written out by hand in three services —
 * driver-finance/escrow-target.service.ts, fuel/fuel-card-overage-contract.service.ts, and
 * legal/signed-finance-handoff.service.ts. Two of them were correct. The third (LEG-02, the FIN-18
 * consent gate) accepted ONLY `signed_electronically`, so a driver whose contract was signed on paper
 * read as UNSIGNED and every deduction against them was blocked. Three hand-copies of a legal-evidence
 * rule is not a style problem: it is how one copy silently falls behind and starts denying money
 * movement, or — worse in the other direction — starts accepting an unevidenced claim.
 *
 * THE TWO CLAUSES, and why both are required:
 *
 *   1. status IN ('signed_electronically', 'signed_on_paper')
 *      Both signed states count. `::text` on purpose: it compares the enum LABEL, so the predicate is
 *      correct on a database where 202609140000 (which adds 'signed_on_paper' to
 *      legal.contract_instance_status) has not been applied. An unqualified enum literal would raise
 *      22P02 on every call there and take the gate down.
 *
 *   2. status <> 'signed_on_paper' OR signed_pdf_attachment_id IS NOT NULL
 *      A wet signature counts ONLY when the scan of the executed original is attached. Mirrors
 *      contract_instances_paper_signature_evidence_check so the application refuses an unbacked claim
 *      even where the CHECK has not landed. Never trust "paper" without the paper — a deduction
 *      defended in front of a DOL examiner or a court rests on that scan existing.
 *
 * Dropping clause 2 while adding clause 1 would "fix" LEG-02 by letting an unevidenced paper claim
 * authorise wage deductions. That is a worse defect than the one being fixed.
 *
 * Usage: interpolate into a WHERE over an alias bound to legal.contract_instances.
 *   `... WHERE ${signedContractPredicate("ci")}`
 * It contains no parameters, so it never disturbs positional placeholders in the calling query.
 */
export function signedContractPredicate(alias: string): string {
  return `${alias}.status::text IN ('signed_electronically', 'signed_on_paper')
      AND (${alias}.status::text <> 'signed_on_paper' OR ${alias}.signed_pdf_attachment_id IS NOT NULL)`;
}

/** The signed states, for callers that need the list rather than the SQL. */
export const SIGNED_CONTRACT_STATUSES = ["signed_electronically", "signed_on_paper"] as const;
