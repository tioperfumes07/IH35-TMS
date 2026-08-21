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
  if (!/EntityLink[\s\S]*kind="settlement"/.test(section)) {
    problems.push(`${SECTION}: dispute rows must render EntityLink kind="settlement"`);
  }
  if (!/EntityLink[\s\S]*kind="liability"/.test(section)) {
    problems.push(`${SECTION}: liability rows must render EntityLink kind="liability"`);
  }
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
  if (!/<DriverSettlementFinanceReverseSection[\s\S]*?driverId=\{id\}/.test(profile)) {
    problems.push(`${DRIVER_PROFILE}: must mount <DriverSettlementFinanceReverseSection driverId={id} .../>`);
  }
  return problems;
}

function selftest() {
  const good = {
    [SECTION]: `
      listSettlementDisputes(operatingCompanyId, { status: "all", driver_id: driverId })
      getLiabilitiesByDriver(driverId, operatingCompanyId)
      <EntityLink kind="settlement" id={d.settlement_id} />
      <EntityLink kind="liability" id={id} />
      <EntityLink kind="settlement_disputes_driver" id={driverId} label="Open Disputes" />
    `,
    [DRIVER_PROFILE]: `
      import { DriverSettlementFinanceReverseSection } from "../../components/driver-profile/DriverSettlementFinanceReverseSection";
      <DriverSettlementFinanceReverseSection operatingCompanyId={companyId} driverId={id} />
    `,
    [ENTITY_LINK]: `
      | "settlement_disputes_driver"
      case "settlement_disputes_driver":
        return \`/driver-finance/settlements?tab=disputes&driver_id=\${id}\`;
    `,
    [DISPUTES_TAB]: `
      const driverIdFromUrl = searchParams.get("driver_id")?.trim() ?? "";
      useEffect(() => { if (driverIdFromUrl) setDriverId(driverIdFromUrl); }, [driverIdFromUrl]);
    `,
    [MATRIX]: JSON.stringify({ leaves: CLAIMED_LEAVES.map((id) => ({ id, required: ["reverse_link"] })) }),
  };
  const goodProblems = assertDriverSettlementFinanceReverse(good);
  if (goodProblems.length) {
    console.error(`${LABEL} SELFTEST FAIL — known-good fixture flagged: ${goodProblems.join("; ")}`);
    process.exit(1);
  }

  const mutations = [
    { ...good, [SECTION]: good[SECTION].replace("driver_id: driverId", "driver_id: undefined") },
    { ...good, [SECTION]: good[SECTION].replace("getLiabilitiesByDriver(driverId, operatingCompanyId)", "") },
    { ...good, [SECTION]: good[SECTION].replace('kind="settlement"', 'kind="dispute"') },
    { ...good, [SECTION]: good[SECTION].replace('kind="liability"', "") },
    { ...good, [SECTION]: good[SECTION].replace('kind="settlement_disputes_driver"', 'kind="settlement"') },
    {
      ...good,
      [SECTION]: good[SECTION].replace(
        '<EntityLink kind="settlement_disputes_driver" id={driverId} label="Open Disputes" />',
        '<Link to="/drivers/disputes">Open Disputes</Link>'
      ),
    },
    { ...good, [ENTITY_LINK]: good[ENTITY_LINK].replaceAll("settlement_disputes_driver", "x") },
    { ...good, [DISPUTES_TAB]: good[DISPUTES_TAB].replace('searchParams.get("driver_id")', 'searchParams.get("x")') },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("import { DriverSettlementFinanceReverseSection }", "// removed import") },
    { ...good, [DRIVER_PROFILE]: good[DRIVER_PROFILE].replace("<DriverSettlementFinanceReverseSection operatingCompanyId={companyId} driverId={id} />", "") },
    ...CLAIMED_LEAVES.map((id) => ({ ...good, [MATRIX]: good[MATRIX].replace(`"id":"${id}"`, `"id":"${id}.removed"`) })),
  ];
  for (const [i, mutated] of mutations.entries()) {
    if (assertDriverSettlementFinanceReverse(mutated).length === 0) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${i} escaped detection`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations all detected`);
  process.exit(0);
}

if (SELFTEST) selftest();

const failures = assertDriverSettlementFinanceReverse();
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS`);
