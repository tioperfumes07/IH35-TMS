#!/usr/bin/env node
/**
 * LOAD-WO-REVERSE ratchet — the dispatch load drawer must show that load's work orders.
 *
 * `maintenance.work_orders.load_id` has always been written, and G18 makes it mandatory for every
 * diesel/roadside expense — but nothing could ASK for a load's work orders, so the drawer had no
 * way to show them. Live prove: load L-20260808-0085 carries TWO work orders whose `load_id` points
 * at it and the drawer rendered neither; `LoadDetailDrawer` did not contain the string "work order".
 *
 * Four things have to hold together or the block silently lies:
 *   1. the route accepts `load_id`                → otherwise the param is ignored
 *   2. the route FILTERS on it                    → otherwise it returns every WO in the company
 *   3. the load-scoped read is NOT open-only      → otherwise completed repairs vanish from history
 *   4. the drawer mounts the section              → otherwise none of the above reaches a screen
 * Each failure mode reads as "no bug" on screen, which is how the original gap survived.
 *
 * Static only — no DB, no network, no build. Runs in well under a second.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const selftest = process.argv.includes("--selftest");

const ROUTE = "apps/backend/src/maintenance/work-orders.routes.ts";
const CLIENT = "apps/frontend/src/api/maintenance.ts";
const SECTION = "apps/frontend/src/components/dispatch/LoadWorkOrdersReverseSection.tsx";
const DRAWER = "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx";
const WO_DETAIL = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";
const WO_TABLE = "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx";
const WO_MODAL = "apps/frontend/src/components/maintenance/WorkOrderDetailModal.tsx";

const stripComments = (text) =>
  text
    .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
    .replace(/\/\/[^\n]*/g, (m) => " ".repeat(m.length));

const read = (rel) => stripComments(readFileSync(join(repoRoot, rel), "utf8"));

const failures = [];

function claimLabelFailures(routeSource, clientSource, detailSource) {
  return [
    ["work-order detail must project claim number", routeSource.includes("ic.claim_number AS insurance_claim_number")],
    ["work-order claim join must use the claim tenant scope", routeSource.includes("ic.tenant_id = w.operating_company_id")],
    [
      "typed claim number must reach the mounted claim drill",
      clientSource.includes("insurance_claim_number?: string | null") &&
        detailSource.includes('<EntityLinkOrTombstone kind="claim" id={wo.insurance_claim_id as string | null} name={wo.insurance_claim_number} noun="Claim"'),
    ],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

const route = read(ROUTE);
if (!/load_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(route)) {
  failures.push(`${ROUTE}: listQuerySchema must accept an optional \`load_id\` uuid.`);
}
if (!/where\.push\(`w\.load_id = \$\$\{values\.length\}`\)/.test(route)) {
  failures.push(`${ROUTE}: \`load_id\` is accepted but never filtered on — the route would return every work order in the company.`);
}
if (!/q\.equipment_id \|\| q\.load_id(?:\s*\|\|\s*q\.driver_id)?/.test(route)) {
  failures.push(
    `${ROUTE}: a load-scoped read must bypass the open-only default (join \`q.load_id\` to the caller-controlled-scope branch) — otherwise completed repairs disappear from the load's history.`
  );
}
// DRV-LINK-WO-REVERSE — same list route must accept + filter driver_id for DriverDetail reverse.
if (!/driver_id:\s*z\.string\(\)\.uuid\(\)\.optional\(\)/.test(route)) {
  failures.push(`${ROUTE}: listQuerySchema must accept an optional \`driver_id\` uuid (driver→WO reverse).`);
}
if (!/where\.push\(`w\.driver_id = \$\$\{values\.length\}`\)/.test(route)) {
  failures.push(`${ROUTE}: \`driver_id\` is accepted but never filtered on.`);
}
if (!/q\.driver_id/.test(route)) {
  failures.push(`${ROUTE}: driver-scoped reads must join the caller-controlled-scope (non-open-only) branch.`);
}

const client = read(CLIENT);
if (!/load_id\?:\s*string/.test(client) || !/qs\.set\(\s*["']load_id["']/.test(client)) {
  failures.push(`${CLIENT}: listWorkOrdersFiltered must accept \`load_id\` AND put it on the query string.`);
}
if (!/driver_id\?:\s*string/.test(client) || !/qs\.set\(\s*["']driver_id["']/.test(client)) {
  failures.push(`${CLIENT}: listWorkOrdersFiltered must accept \`driver_id\` AND put it on the query string.`);
}

const driverWoSection = "apps/frontend/src/components/maintenance/DriverWorkOrdersReverseSection.tsx";
const driverDetail = "apps/frontend/src/pages/DriverDetail.tsx";
const driverProfile = "apps/frontend/src/pages/drivers/DriverProfilePage.tsx";
const drvSection = read(driverWoSection);
if (!/listWorkOrdersFiltered\s*\(/.test(drvSection) || !/driver_id:\s*driverId/.test(drvSection)) {
  failures.push(`${driverWoSection}: must call listWorkOrdersFiltered with \`driver_id: driverId\`.`);
}
if (!/kind=["']work_order["']/.test(drvSection)) {
  failures.push(`${driverWoSection}: must EntityLink kind="work_order".`);
}
const driverLoadLabelPattern = /<EntityLinkOrTombstone[\s\S]{0,180}kind=["']load["'][\s\S]{0,120}id=\{String\(wo\.load_id\)\}[\s\S]{0,120}name=\{wo\.linked_load_number\}[\s\S]{0,80}noun=["']Load["']/;
if (!driverLoadLabelPattern.test(drvSection)) {
  failures.push(`${driverWoSection}: load drill must bind load_id + persisted linked_load_number through EntityLinkOrTombstone.`);
}
const drvDetail = read(driverDetail);
if (!/<DriverWorkOrdersReverseSection(?![A-Za-z0-9_])/.test(drvDetail)) {
  failures.push(`${driverDetail}: must mount <DriverWorkOrdersReverseSection …/>.`);
}
const drvProfile = read(driverProfile);
const driverProfileMountPattern = /<DriverWorkOrdersReverseSection[\s\S]{0,220}operatingCompanyId=\{companyId\}[\s\S]{0,160}driverId=\{id\}[\s\S]{0,160}data-testid="driver-profile-work-orders-reverse"/;
if (!driverProfileMountPattern.test(drvProfile)) {
  failures.push(`${driverProfile}: mounted /drivers/:id/profile route must render the driver-scoped work-order reverse section.`);
}

const section = read(SECTION);
if (!/listWorkOrdersFiltered\s*\(/.test(section) || !/load_id:\s*loadId/.test(section)) {
  failures.push(`${SECTION}: must call listWorkOrdersFiltered with \`load_id: loadId\`.`);
}
if (!/load-reverse-work-orders/.test(section)) {
  failures.push(`${SECTION}: lost its data-testid — the reverse block is no longer addressable in tests.`);
}
if (!/EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number \?\? null\} noun="Unit"/.test(section)) {
  failures.push(`${SECTION}: unit drill must preserve a missing unit_number as null instead of rendering the literal label "null".`);
}

const drawer = read(DRAWER);
// Anchored to the JSX element with a trailing boundary: a bare substring test also matches a typo'd
// `LoadWorkOrdersReverseSectionX`, which is exactly the mistake this check exists to catch.
if (!/<LoadWorkOrdersReverseSection(?![A-Za-z0-9_])/.test(drawer)) {
  failures.push(`${DRAWER}: does not render <LoadWorkOrdersReverseSection …/> — the load drawer shows no maintenance at all.`);
}
if (!/import\s*\{\s*LoadWorkOrdersReverseSection\s*\}/.test(drawer)) {
  failures.push(`${DRAWER}: does not import LoadWorkOrdersReverseSection.`);
}

// Forward half of the same hop — WO detail / list / modal must drill TO the load (and unit/vendor).
const woDetail = read(WO_DETAIL);
failures.push(...claimLabelFailures(route, client, woDetail));
if (!/wo-detail-linkage-section/.test(woDetail)) {
  failures.push(`${WO_DETAIL}: missing data-testid=wo-detail-linkage-section — WO→load/unit/vendor forward links not addressable.`);
}
if (!/kind=\"load\"/.test(woDetail) || !/kind=\"unit\"/.test(woDetail) || !/kind=\"vendor\"/.test(woDetail)) {
  failures.push(`${WO_DETAIL}: linkage section must EntityLink kind=load + unit + vendor (forward from WO).`);
}
if (!/kind=\"claim\"/.test(woDetail)) {
  failures.push(`${WO_DETAIL}: must EntityLink insurance_claim_id as kind=claim when present.`);
}

const woTable = read(WO_TABLE);
if (!/key:\s*[\"']load_id[\"']/.test(woTable) || !/kind=\"load\"/.test(woTable)) {
  failures.push(`${WO_TABLE}: Active WOs table must show a Load column with EntityLink kind=load.`);
}

const woModal = read(WO_MODAL);
if (!/kind=\"load\"/.test(woModal) || !/kind=\"unit\"/.test(woModal)) {
  failures.push(`${WO_MODAL}: detail modal must EntityLink unit + load (not raw UUIDs).`);
}

if (failures.length > 0) {
  console.error("FAIL verify-load-reverse-work-orders");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

if (selftest) {
  const plantedProfileMount = drvProfile.replace("driver-profile-work-orders-reverse", "driver-profile-work-orders-dead");
  if (plantedProfileMount === drvProfile || driverProfileMountPattern.test(plantedProfileMount)) {
    console.error("FAIL verify-load-reverse-work-orders SELFTEST — planted DriverProfilePage reverse-mount defect escaped");
    process.exit(1);
  }
  const planted = drvSection.replace("name={wo.linked_load_number}", "name={null}");
  if (planted === drvSection || driverLoadLabelPattern.test(planted)) {
    console.error("FAIL verify-load-reverse-work-orders SELFTEST — planted driver WO load-label defect escaped");
    process.exit(1);
  }
  const plantedUnitLabel = section.replace("name={row.unit_number ?? null}", "name={String(row.unit_number)}");
  if (plantedUnitLabel === section || /EntityLinkOrTombstone kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number \?\? null\} noun="Unit"/.test(plantedUnitLabel)) {
    console.error("FAIL verify-load-reverse-work-orders SELFTEST — planted literal-null unit label escaped");
    process.exit(1);
  }
  const claimMutations = [
    claimLabelFailures(route.replace("ic.claim_number AS insurance_claim_number", "NULL AS insurance_claim_number"), client, woDetail).length > 0,
    claimLabelFailures(route.replace("ic.tenant_id = w.operating_company_id", "TRUE"), client, woDetail).length > 0,
    claimLabelFailures(
      route,
      client,
      woDetail.replace(
        '<EntityLinkOrTombstone kind="claim" id={wo.insurance_claim_id as string | null} name={wo.insurance_claim_number} noun="Claim"',
        '<EntityLinkOrTombstone kind="claim" id={wo.insurance_claim_id as string | null} name={null} noun="Claim"'
      )
    ).length > 0,
  ];
  if (claimMutations.some((caught) => !caught)) {
    console.error("FAIL verify-load-reverse-work-orders SELFTEST — planted claim-label defect escaped");
    process.exit(1);
  }
  console.log("PASS verify-load-reverse-work-orders SELFTEST — profile mount + driver load label + 3/3 claim-label mutations caught");
  process.exit(0);
}

console.log("PASS verify-load-reverse-work-orders — load↔WO and both driver profiles: reverse lists plus WO detail/table/modal EntityLink load/unit/vendor/claim");
