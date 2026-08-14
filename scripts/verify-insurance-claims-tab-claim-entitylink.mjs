#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link","connectivity"],"leafRe":"^claims\\.list$","task":"LINK-CLAIMSTAB-CLAIM-ENTITYLINK"} */
/**
 * ClaimsTab "Claim #" column must render a real EntityLink(kind="claim"), not a plain button/span.
 *
 * ROOT CAUSE: the row previously called setHighlightedClaimId(claim.id) on a bare <button> — local
 * state only, no URL change. Every OTHER module that points at a claim (bills/expenses reverse
 * sections, legal matters) already generates EntityLink(kind="claim") -> /safety/insurance/claims?
 * claim_id=<id> — the exact route this page lives on and already honors via the deepLinkClaimId
 * search-param effect. The self-referential half of that loop was missing: clicking a row here never
 * produced the canonical, bookmarkable URL other screens already assume exists.
 *
 * This guard is intentionally narrow (one leaf, one column render) rather than a broad leafRe=.* claim
 * — see LINK-THEATER-01 (docs/law/LAW.json) for why that distinction is enforced.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/insurance/ClaimsTab.tsx";
const LABEL = "verify-insurance-claims-tab-claim-entitylink";

export function audit(source) {
  const problems = [];
  const claimNumberBlockMatch = source.match(/key:\s*"claim_number"[\s\S]{0,600}?render:\s*\(claim\)\s*=>\s*\(([\s\S]{0,2000}?)\n\s*\),\n\s*\},/);
  if (!claimNumberBlockMatch) {
    problems.push(`${FILE}: could not locate the claim_number column render block — structure changed, re-anchor this guard`);
    return problems;
  }
  const block = claimNumberBlockMatch[1];
  if (!/<EntityLink\b/.test(block)) {
    problems.push(`${FILE}: claim_number column no longer renders <EntityLink> — self-referential claim URL lost`);
  }
  if (!/kind="claim"/.test(block)) {
    problems.push(`${FILE}: claim_number EntityLink must use kind="claim" (matches every reverse section pointing here)`);
  }
  if (!/id=\{claim\.id\}/.test(block)) {
    problems.push(`${FILE}: claim_number EntityLink must pass id={claim.id} — the real canonical id, not a derived/blank value`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `key: "claim_number",\n  label: "Claim #",\n  sortable: true,\n  render: (claim) => (\n    <EntityLink\n      kind="claim"\n      id={claim.id}\n      label={entityLabel(claim.claim_number, claim.id, "Claim")}\n    />\n  ),\n},`;
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink block rejected`);
    process.exit(1);
  }
  const mutatedButton = `key: "claim_number",\n  label: "Claim #",\n  sortable: true,\n  render: (claim) => (\n    <button type="button" onClick={() => setHighlightedClaimId(claim.id)}>\n      {entityLabel(claim.claim_number, claim.id, "Claim")}\n    </button>\n  ),\n},`;
  if (!audit(mutatedButton).length) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-to-button mutation escaped`);
    process.exit(1);
  }
  const mutatedWrongKind = good.replace('kind="claim"', 'kind="customer"');
  if (!audit(mutatedWrongKind).length) {
    console.error(`${LABEL} SELFTEST FAIL — wrong-kind mutation escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — button-revert and wrong-kind mutations both rejected`);
  process.exit(0);
}

const source = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const failures = audit(source);
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ClaimsTab claim_number column is a real, canonical EntityLink`);
