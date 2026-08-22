#!/usr/bin/env node
/**
 * Factors gain a real EntityLink kind — same class as LINK-F5140 (geofence): EntityLink.tsx kind
 * "factor" resolves to /factoring/factors?factor_id=, FactorAdmin.tsx reads that param (resolving
 * the full Factor object from factorsQuery once it loads, since selectedFactor needs the whole
 * object, not just an id) and highlights the row, and ReserveDashboard.tsx / ReserveTracker.tsx's
 * per-balance factor labels drill through instead of rendering dead text.
 *
 * This guard asserts all legs together — a half-fix (EntityKind added but never consumed, or
 * consumed but the display sites left as dead text) is exactly what a single-leg check would miss.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factor-entitylink-drill";

const ENTITY_LINK_FILE = "apps/frontend/src/components/shared/EntityLink.tsx";
const FACTOR_ADMIN_FILE = "apps/frontend/src/pages/factoring/FactorAdmin.tsx";
const RESERVE_DASHBOARD_FILE = "apps/frontend/src/pages/factoring/ReserveDashboard.tsx";
const RESERVE_TRACKER_FILE = "apps/frontend/src/pages/factoring/ReserveTracker.tsx";

export function auditEntityLinkSource(source) {
  const problems = [];
  if (!/\|\s*"factor"/.test(source)) problems.push(`${ENTITY_LINK_FILE}: EntityKind union no longer declares "factor"`);
  if (!/case\s+"factor"\s*:\s*\n\s*return\s+`\/factoring\/factors\?factor_id=\$\{id\}`/.test(source)) {
    problems.push(`${ENTITY_LINK_FILE}: resolveEntityRoute no longer resolves "factor" to /factoring/factors?factor_id=`);
  }
  return problems;
}

export function auditFactorAdminSource(source) {
  const problems = [];
  if (!/searchParams\.get\(\s*"factor_id"\s*\)/.test(source)) {
    problems.push(`${FACTOR_ADMIN_FILE}: no longer reads ?factor_id= from the URL — deep link into this page is dead`);
  }
  if (!/factorsQuery\.data\)\s*return;/.test(source) && !/factorsQuery\.data/.test(source)) {
    problems.push(`${FACTOR_ADMIN_FILE}: deep-link effect no longer resolves against factorsQuery.data — selectedFactor needs the full object`);
  }
  if (!/setSelectedFactor\(match\)/.test(source)) {
    problems.push(`${FACTOR_ADMIN_FILE}: deep-link effect no longer calls setSelectedFactor(match)`);
  }
  return problems;
}

export function auditDisplaySite(source, file) {
  const problems = [];
  if (!/kind="factor"/.test(source)) problems.push(`${file}: factor label no longer renders EntityLink kind="factor" — reverted to dead text`);
  return problems;
}

if (process.argv.includes("--selftest")) {
  const goodEntityLink = 'export type EntityKind =\n  | "geofence"\n  | "factor";\nexport function resolveEntityRoute(kind, id) {\n  switch (kind) {\n    case "geofence":\n      return `/dispatch/geofencing?geofence_id=${id}`;\n    case "factor":\n      return `/factoring/factors?factor_id=${id}`;\n    default:\n      return null;\n  }\n}';
  if (auditEntityLinkSource(goodEntityLink).length) {
    console.error(`${LABEL} SELFTEST FAIL — real EntityLink factor support rejected`);
    process.exit(1);
  }
  const mutatedEntityLink = goodEntityLink.replace('| "factor";', ';').replace(/case "factor":\n\s*return `\/factoring\/factors\?factor_id=\$\{id\}`;\n/, "");
  if (!auditEntityLinkSource(mutatedEntityLink).length) {
    console.error(`${LABEL} SELFTEST FAIL — removed EntityKind/route mutation escaped`);
    process.exit(1);
  }

  const goodAdmin = 'const deepLinkFactorId = searchParams.get("factor_id");\nuseEffect(() => {\n  if (!deepLinkFactorId || !factorsQuery.data) return;\n  const match = factorsQuery.data.find((f) => f.id === deepLinkFactorId);\n  if (match) setSelectedFactor(match);\n}, [deepLinkFactorId, factorsQuery.data]);';
  if (auditFactorAdminSource(goodAdmin).length) {
    console.error(`${LABEL} SELFTEST FAIL — real FactorAdmin wiring rejected`);
    process.exit(1);
  }
  const mutatedAdmin = 'const [selectedFactor, setSelectedFactor] = useState(null);';
  if (!auditFactorAdminSource(mutatedAdmin).length) {
    console.error(`${LABEL} SELFTEST FAIL — FactorAdmin regression escaped`);
    process.exit(1);
  }

  const goodSite = '<EntityLink kind="factor" id={balance.factor_id} label={entityLabel(factorNameById.get(balance.factor_id), balance.factor_id, "Factor")} />';
  if (auditDisplaySite(goodSite, RESERVE_DASHBOARD_FILE).length) {
    console.error(`${LABEL} SELFTEST FAIL — real display-site wiring rejected`);
    process.exit(1);
  }
  const mutatedSite = '{entityLabel(factorNameById.get(balance.factor_id), balance.factor_id, "Factor")}';
  if (!auditDisplaySite(mutatedSite, RESERVE_DASHBOARD_FILE).length) {
    console.error(`${LABEL} SELFTEST FAIL — display-site regression to dead text escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — all legs' mutations rejected`);
  process.exit(0);
}

const failures = [
  ...auditEntityLinkSource(fs.readFileSync(path.join(ROOT, ENTITY_LINK_FILE), "utf8")),
  ...auditFactorAdminSource(fs.readFileSync(path.join(ROOT, FACTOR_ADMIN_FILE), "utf8")),
  ...auditDisplaySite(fs.readFileSync(path.join(ROOT, RESERVE_DASHBOARD_FILE), "utf8"), RESERVE_DASHBOARD_FILE),
  ...auditDisplaySite(fs.readFileSync(path.join(ROOT, RESERVE_TRACKER_FILE), "utf8"), RESERVE_TRACKER_FILE),
];
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — factor EntityLink, FactorAdmin deep-link consumption, and reserve display sites all wired`);
