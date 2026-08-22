#!/usr/bin/env node
/** @matrix-built {"modules":["settlements"],"cols":["reverse_link"],"leafRe":"^(settlements\\.disputes|liabilities\\.list)$","task":"LINK-F5173-driver-settlement-finance-reverse"} */
/**
 * GUARD: the driver's own profile shows settlement disputes and liabilities charged to them
 * (LINK-F5171 reverse_link sweep gaps settlements:disputes / settlements:liabilities.list).
 *
 * driver_finance.driver_settlement_disputes.driver_id and driver_finance.driver_liabilities.driver_id
 * are real FKs with driver-scoped backend functions already shipped (listSettlementDisputes with
 * driver_id, getLiabilitiesByDriver) -- neither was ever read from the driver's own profile page.
 * Same root cause DriverFinesReverseSection (SAF-F16) already fixed for fines.
 *
 * Fix contract this guard pins:
 *   1. DriverSettlementFinanceReverseSection.tsx exists and calls BOTH driver-scoped reads.
 *   2. DriverProfilePage.tsx imports AND mounts it with the driver's id -- unmounted = fake fix.
 *   3. Each dispute/liability row renders a real EntityLink, not plain text.
 *   4. "Open Disputes" is EntityLink kind="settlement_disputes_driver" (not bare /drivers/disputes).
 *   5. EntityLink resolves that kind to /driver-finance/settlements?tab=disputes&driver_id=.
 *   6. SettlementDisputesTab seeds its driver filter from ?driver_id= URL.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SECTION = "apps/frontend/src/components/driver-profile/DriverSettlementFinanceReverseSection.tsx";
const DRIVER_PROFILE = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const ENTITY_LINK = "apps/frontend/src/components/shared/EntityLink.tsx";
const DISPUTES_TAB = "apps/frontend/src/pages/driver-finance/components/SettlementDisputesTab.tsx";
const MATRIX = "docs/specs/scoreboard/modules/settlements.required.json";
const CLAIMED_LEAVES = ["settlements.disputes", "liabilities.list"];
const FILES = [SECTION, DRIVER_PROFILE, ENTITY_LINK, DISPUTES_TAB, MATRIX];
const LABEL = "verify-driver-settlement-finance-reverse-section";
const SELFTEST = process.argv.includes("--selftest");

const read = (rel) => fs.readFileSync(path.join(ROOT, rel), "utf8");

export function assertDriverSettlementFinanceReverse(sources) {
  const src = {};
  for (const rel of FILES) src[rel] = sources?.[rel] ?? read(rel);
  const problems = [];
  const section = src[SECTION];
  const profile = src[DRIVER_PROFILE];
  const entityLink = src[ENTITY_LINK];
  const disputesTab = src[DISPUTES_TAB];
  try {
    const matrix = JSON.parse(src[MATRIX]);
    for (const id of CLAIMED_LEAVES) {
      const leaf = matrix.leaves?.find((item) => item.id === id);
      if (!leaf?.required?.includes("reverse_link")) problems.push(`${MATRIX}: exact Required ownership missing ${id}:reverse_link`);
    }
  } catch {
    problems.push(`${MATRIX}: settlements Required matrix must parse`);
  }

  if (!/listSettlementDisputes\(\s*operatingCompanyId\s*,\s*\{[^}]*driver_id:\s*driverId/.test(section)) {
    problems.push(`${SECTION}: must call listSettlementDisputes scoped to driver_id: driverId`);
  }
  if (!/getLiabilitiesByDriver\(\s*driverId\s*,\s*operatingCompanyId\s*\)/.test(section)) {
    problems.push(`${SECTION}: must call getLiabilitiesByDriver(driverId, operatingCompanyId)`);
  }
  if (!/queryKey: \["settlement-disputes", "reverse-driver", operatingCompanyId, driverId\]/.test(section)) problems.push(`${SECTION}: dispute cache identity must include company and driver`);
  if (!/queryKey: \["liabilities", "reverse-driver", operatingCompanyId, driverId\]/.test(section)) problems.push(`${SECTION}: liability cache identity must include company and driver`);
  if (!/const enabled = Boolean\(operatingCompanyId\) && Boolean\(driverId\)/.test(section) || !/enabled,/.test(section)) problems.push(`${SECTION}: both reverse reads must wait for company and driver scope`);
  if (!/kind="settlement"[\s\S]{0,100}id=\{d\.settlement_id\}/.test(section)) {
    problems.push(`${SECTION}: dispute rows must drill their exact settlement id`);
  }
  if (!/entityLabel\(d\.settlement_display_id \?\? null, d\.settlement_id, "Settlement"\)/.test(section)) problems.push(`${SECTION}: dispute rows must use the human settlement label`);
  if (!/kind="liability"[\s\S]{0,100}id=\{id\}/.test(section)) {
    problems.push(`${SECTION}: liability rows must drill their exact liability id`);
  }
  if (!/entityLabel\(l\.type as string \| null, id, "Liability"\)/.test(section)) problems.push(`${SECTION}: liability rows must use a human type label`);
  if (!/kind="journal_entry"[\s\S]{0,100}id=\{d\.resolution_journal_entry_id\}/.test(section)) problems.push(`${SECTION}: resolved disputes must drill the corrective journal entry`);
  if (!/Failed to load settlement disputes\./.test(section) || !/Failed to load liabilities\./.test(section)) problems.push(`${SECTION}: each reverse reader must expose its failure`);
  if (!/No open disputes or liabilities for this driver\./.test(section)) problems.push(`${SECTION}: reverse section must distinguish a true empty result`);
  if (!/kind="settlement_disputes_driver"/.test(section)) {
    problems.push(`${SECTION}: Open Disputes must use EntityLink kind="settlement_disputes_driver"`);
  }
  if (/to="\/drivers\/disputes"/.test(section)) {
    problems.push(`${SECTION}: must not use bare Link to="/drivers/disputes" (drops driver filter)`);
  }
  if (!/settlement_disputes_driver/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: must declare settlement_disputes_driver kind`);
  }
  if (!/case "settlement_disputes_driver":[\s\S]*?driver_id=/.test(entityLink)) {
    problems.push(`${ENTITY_LINK}: settlement_disputes_driver must resolve with driver_id query`);
  }
  if (!/searchParams\.get\("driver_id"\)/.test(disputesTab)) {
    problems.push(`${DISPUTES_TAB}: must seed driver filter from ?driver_id=`);
  }
  if (!/import\s*\{\s*DriverSettlementFinanceReverseSection\s*\}/.test(profile)) {
    problems.push(`${DRIVER_PROFILE}: must import DriverSettlementFinanceReverseSection`);
  }
  if (!/<DriverSettlementFinanceReverseSection[\s\S]{0,180}operatingCompanyId=\{companyId\}[\s\S]{0,180}driverId=\{id\}/.test(profile)) {
    problems.push(`${DRIVER_PROFILE}: must mount the reverse section with company and driver id`);
  }
  return problems;
}

function selftest() {
  const good = Object.fromEntries(FILES.map((file) => [file, read(file)]));
  const goodProblems = assertDriverSettlementFinanceReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const plants = [
    [SECTION, /driver_id:\s*driverId/, "driver_id: undefined"],
    [SECTION, /getLiabilitiesByDriver\(driverId, operatingCompanyId\)/, "getLiabilitiesByDriver(driverId, '')"],
    [SECTION, /\["settlement-disputes", "reverse-driver", operatingCompanyId, driverId\]/, '["settlement-disputes"]'],
    [SECTION, /\["liabilities", "reverse-driver", operatingCompanyId, driverId\]/, '["liabilities"]'],
    [SECTION, /const enabled = Boolean\(operatingCompanyId\) && Boolean\(driverId\)/, "const enabled = true"],
    [SECTION, /id=\{d\.settlement_id\}/, "id={driverId}"],
    [SECTION, /entityLabel\(d\.settlement_display_id \?\? null, d\.settlement_id, "Settlement"\)/, 'entityLabel(null, d.settlement_id, "Settlement")'],
    [SECTION, /id=\{id\}/, "id={driverId}"],
    [SECTION, /entityLabel\(l\.type as string \| null, id, "Liability"\)/, 'entityLabel(null, id, "Liability")'],
    [SECTION, /id=\{d\.resolution_journal_entry_id\}/, "id={driverId}"],
    [SECTION, /kind="settlement_disputes_driver"/, 'kind="settlement"'],
    [SECTION, /Failed to load settlement disputes\./, "Loading disputes"],
    [SECTION, /Failed to load liabilities\./, "Loading liabilities"],
    [SECTION, /No open disputes or liabilities for this driver\./, "No rows"],
    [ENTITY_LINK, /case "settlement_disputes_driver":/, 'case "removed_settlement_disputes_driver":'],
    [DISPUTES_TAB, /searchParams\.get\("driver_id"\)/, 'searchParams.get("x")'],
    [DRIVER_PROFILE, /import\s*\{\s*DriverSettlementFinanceReverseSection\s*\}/, "import { RemovedSettlementFinanceSection }"],
    [DRIVER_PROFILE, /(<DriverSettlementFinanceReverseSection\s+)operatingCompanyId=\{companyId\}/, "$1operatingCompanyId={undefined}"],
    [DRIVER_PROFILE, /(<DriverSettlementFinanceReverseSection\s+operatingCompanyId=\{companyId\}\s+)driverId=\{id\}/, "$1driverId={undefined}"],
  ];
  for (const [i, [file, pattern, replacement]] of plants.entries()) {
    const changed = good[file].replace(pattern, replacement);
    if (changed === good[file] || assertDriverSettlementFinanceReverse({ ...good, [file]: changed }).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — production mutation ${i} escaped or was inert`);
      process.exit(1);
    }
  }
  for (const id of CLAIMED_LEAVES) {
    const changed = good[MATRIX].replace(`"id": "${id}"`, `"id": "${id}.removed"`);
    if (changed === good[MATRIX] || assertDriverSettlementFinanceReverse({ ...good, [MATRIX]: changed }).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — matrix mutation escaped for ${id}`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${plants.length + CLAIMED_LEAVES.length}/${plants.length + CLAIMED_LEAVES.length} production/matrix mutations detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertDriverSettlementFinanceReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
