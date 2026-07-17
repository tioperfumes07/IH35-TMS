#!/usr/bin/env node
// H-01 GUARD — Topbar entity badge and CarrierSwitcher must share CompanyContext.selectedCompany.
// Root cause: legalNameChip read identity /me/current-company while the switcher read selectedCompany,
// so the orange badge and "Current:" dropdown could disagree after a context switch.
import fs from "node:fs";

const TOPBAR = "apps/frontend/src/components/Topbar.tsx";
const SWITCHER = "apps/frontend/src/components/layout/CarrierSwitcher.tsx";
const HELPER = "apps/frontend/src/lib/selected-company-label.ts";

export function checkEntityBadgeSingleSource({ topbar, switcher, helper }) {
  const reasons = [];
  if (/getIdentityCurrentCompany/.test(topbar)) {
    reasons.push(`${TOPBAR}: must not call getIdentityCurrentCompany for the entity badge (use CompanyContext.selectedCompany)`);
  }
  if (/identityCompanyQuery/.test(topbar)) {
    reasons.push(`${TOPBAR}: must not use identityCompanyQuery for the entity badge (use CompanyContext.selectedCompany)`);
  }
  if (/\["identity",\s*"me",\s*"current-company"\]/.test(topbar)) {
    reasons.push(`${TOPBAR}: must not query ["identity","me","current-company"] for the entity badge`);
  }
  if (!/selectedCompanyLegalBadgeLabel/.test(topbar)) {
    reasons.push(`${TOPBAR}: legalNameChip must use selectedCompanyLegalBadgeLabel(selectedCompany)`);
  }
  if (!/selectedCompanySwitcherLabel/.test(switcher)) {
    reasons.push(`${SWITCHER}: selectedLabel must use selectedCompanySwitcherLabel(selectedCompany)`);
  }
  if (!/export function selectedCompanyLegalBadgeLabel/.test(helper)) {
    reasons.push(`${HELPER}: shared selectedCompanyLegalBadgeLabel helper missing`);
  }
  if (!/export function selectedCompanySwitcherLabel/.test(helper)) {
    reasons.push(`${HELPER}: shared selectedCompanySwitcherLabel helper missing`);
  }
  return reasons;
}

function selfTest() {
  const ok = checkEntityBadgeSingleSource({
    topbar: 'selectedCompanyLegalBadgeLabel(selectedCompany)',
    switcher: 'selectedCompanySwitcherLabel(selectedCompany)',
    helper: 'export function selectedCompanyLegalBadgeLabel\nexport function selectedCompanySwitcherLabel',
  });
  const bad = checkEntityBadgeSingleSource({
    topbar: 'identityCompanyQuery.data?.company_legal_name',
    switcher: 'selectedCompany?.short_name',
    helper: '',
  });
  if (ok.length !== 0 || bad.length < 3) {
    console.error("self-test FAILED");
    process.exit(1);
  }
  console.log("self-test PASS");
}

function main() {
  if (process.argv.includes("--self-test")) {
    selfTest();
    return;
  }
  selfTest();
  const topbar = fs.readFileSync(TOPBAR, "utf8");
  const switcher = fs.readFileSync(SWITCHER, "utf8");
  const helper = fs.readFileSync(HELPER, "utf8");
  const reasons = checkEntityBadgeSingleSource({ topbar, switcher, helper });
  if (reasons.length) {
    console.error("\nFAIL verify-entity-badge-single-source:");
    reasons.forEach((r) => console.error(`  • ${r}`));
    process.exit(1);
  }
  console.log("\nPASS verify-entity-badge-single-source — Topbar badge and CarrierSwitcher share selectedCompany.");
}

main();
