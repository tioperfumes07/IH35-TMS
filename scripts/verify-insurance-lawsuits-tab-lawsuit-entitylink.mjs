#!/usr/bin/env node
/** @matrix-built {"modules":["insurance"],"cols":["reverse_link","connectivity"],"leafRe":"^lawsuits\\.list$","task":"LINK-LAWSUITSTAB-LAWSUIT-ENTITYLINK"} */
/**
 * LawsuitsTab "Case #" column must render a real EntityLink(kind="lawsuit"), not a plain button/span.
 *
 * Same class as verify-insurance-claims-tab-claim-entitylink.mjs: LegalMatterDetailPage's
 * insurance_lawsuit_id reverse link already generates EntityLink(kind="lawsuit") ->
 * /safety/insurance/lawsuits?lawsuit_id=<id> — this exact page, which already honors that param via
 * deepLinkLawsuitId. The row's own click previously stayed local-state-only; this closes the loop.
 *
 * Narrow leafRe (one leaf, one column) — never leafRe=.* (LINK-THEATER-01, LAW.json).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILE = "apps/frontend/src/pages/insurance/LawsuitsTab.tsx";
const LABEL = "verify-insurance-lawsuits-tab-lawsuit-entitylink";

export function audit(source) {
  const problems = [];
  const match = source.match(/key:\s*"case_number"[\s\S]{0,600}?render:\s*\(lawsuit\)\s*=>\s*\(([\s\S]{0,2000}?)\n\s*\),\n\s*\},/);
  if (!match) {
    problems.push(`${FILE}: could not locate the case_number column render block — structure changed, re-anchor this guard`);
    return problems;
  }
  const block = match[1];
  if (!/<EntityLink\b/.test(block)) {
    problems.push(`${FILE}: case_number column no longer renders <EntityLink> — self-referential lawsuit URL lost`);
  }
  if (!/kind="lawsuit"/.test(block)) {
    problems.push(`${FILE}: case_number EntityLink must use kind="lawsuit" (matches LegalMatterDetailPage's reverse link)`);
  }
  if (!/id=\{lawsuit\.id\}/.test(block)) {
    problems.push(`${FILE}: case_number EntityLink must pass id={lawsuit.id} — the real canonical id`);
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const good = `key: "case_number",\n  label: "Case #",\n  sortable: true,\n  render: (lawsuit) => (\n    <EntityLink\n      kind="lawsuit"\n      id={lawsuit.id}\n      label={entityLabel(lawsuit.case_number, lawsuit.id, "Case")}\n    />\n  ),\n},`;
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink block rejected`);
    process.exit(1);
  }
  const mutatedButton = `key: "case_number",\n  label: "Case #",\n  sortable: true,\n  render: (lawsuit) => (\n    <button type="button" onClick={() => setSelectedLawsuitId(lawsuit.id)}>\n      {entityLabel(lawsuit.case_number, lawsuit.id, "Case")}\n    </button>\n  ),\n},`;
  if (!audit(mutatedButton).length) {
    console.error(`${LABEL} SELFTEST FAIL — reverted-to-button mutation escaped`);
    process.exit(1);
  }
  const mutatedWrongKind = good.replace('kind="lawsuit"', 'kind="claim"');
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
console.log(`${LABEL} PASS — LawsuitsTab case_number column is a real, canonical EntityLink`);
