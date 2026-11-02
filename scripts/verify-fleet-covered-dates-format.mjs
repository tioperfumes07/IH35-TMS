#!/usr/bin/env node
/**
 * Codex QA 11-02 — Insurance Fleet Covered must render dates as MM/DD/YYYY via formatDateUS.
 * Fleet Home attention meta must humanize enum status (OutOfService → Out of service).
 */
import fs from "node:fs";

const LABEL = "verify-fleet-covered-dates-format";
const FLEET_COVERED = "apps/frontend/src/pages/insurance/FleetCoveredPage.tsx";
const FLEET_HOME = "apps/frontend/src/pages/fleet/FleetHomePage.tsx";

function collect(fleetSrc, homeSrc) {
  const fails = [];
  if (!/import \{ formatDateUS \} from ["'].*formatDate["']/.test(fleetSrc)) {
    fails.push(`${FLEET_COVERED}: must import formatDateUS`);
  }
  if (!/formatDateUS\(coverage\.expiry_date\)/.test(fleetSrc)) {
    fails.push(`${FLEET_COVERED}: policy expiry badge must use formatDateUS(coverage.expiry_date)`);
  }
  if (/\{coverage\.policy_number\} · \{coverage\.expiry_date\}/.test(fleetSrc)) {
    fails.push(`${FLEET_COVERED}: must not interpolate raw coverage.expiry_date`);
  }
  if (!/formatDateUS\(row\.covered_since\)/.test(fleetSrc)) {
    fails.push(`${FLEET_COVERED}: Covered Since must render via formatDateUS(row.covered_since)`);
  }
  if (/render:\s*\(row\)\s*=>\s*row\.covered_since\s*\?\?\s*["']—["']/.test(fleetSrc)) {
    fails.push(`${FLEET_COVERED}: Covered Since must not render raw covered_since`);
  }

  if (!/import \{ humanizeEnumLabel \} from ["'].*humanizeEnumLabel["']/.test(homeSrc)) {
    fails.push(`${FLEET_HOME}: must import humanizeEnumLabel`);
  }
  if (!/meta:\s*humanizeEnumLabel\(u\.status\)/.test(homeSrc)) {
    fails.push(`${FLEET_HOME}: Needs attention meta must humanizeEnumLabel(u.status)`);
  }
  if (/meta:\s*u\.status\s*\?\?/.test(homeSrc)) {
    fails.push(`${FLEET_HOME}: Needs attention must not render raw u.status`);
  }
  if (/\(FLT-F428\)/.test(homeSrc) || /migration and round/.test(homeSrc)) {
    fails.push(`${FLEET_HOME}: banner must not expose FLT-F428 / migration-round developer wording`);
  }
  return fails;
}

const fleet = fs.readFileSync(FLEET_COVERED, "utf8");
const home = fs.readFileSync(FLEET_HOME, "utf8");

if (process.argv.includes("--selftest")) {
  const live = collect(fleet, home);
  if (live.length) {
    console.error(`${LABEL} --selftest FAIL live red:\n  ${live.join("\n  ")}`);
    process.exit(1);
  }
  const plantFleet = fleet
    .replace(/import \{ formatDateUS \} from ["'][^"']+["'];\n?/, "")
    .replace(/const expiry = formatDateUS\(coverage\.expiry_date\) \|\| "—";\n\s*/g, "")
    .replace(/\{coverage\.policy_number\} · \{expiry\}/g, "{coverage.policy_number} · {coverage.expiry_date}")
    .replace(/formatDateUS\(row\.covered_since\) \|\| "—"/g, 'row.covered_since ?? "—"');
  const plantHome = home
    .replace(/import \{ humanizeEnumLabel \} from ["'][^"']+["'];\n?/, "")
    .replace(/humanizeEnumLabel\(u\.status\) \|\| "—"/g, 'u.status ?? "—"')
    .replace(
      /Registration, inspection, and insurance expiry dates are tracked on driver credentials today,\s*not on unit or trailer records\. Expiry tiles stay off this board until those dates live on\s*the fleet asset itself\./,
      "Registration, inspection, and insurance expiry are not on unit or trailer records yet (FLT-F428). that needs its own migration and round.",
    );
  const planted = collect(plantFleet, plantHome);
  if (planted.length < 5) {
    console.error(`${LABEL} --selftest FAIL: plant should trip ≥5 checks, got ${planted.length}`, planted);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = collect(fleet, home);
if (fails.length) {
  console.error(`${LABEL}: FAIL\n  ${fails.join("\n  ")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — Fleet Covered dates + Fleet Home status humanized`);
