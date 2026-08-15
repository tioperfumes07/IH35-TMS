#!/usr/bin/env node
/** @matrix-built {"modules":["lists","drivers"],"cols":["driver","connectivity","reverse_link"],"leafRe":"^(catalog\.drivers\.teams\.list|profiles\.detail)$","task":"VERTICAL-REVERSE-LINK-DRIVER-TEAMS"} */
import fs from "node:fs";

const profile = fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "utf8");
const reverse = fs.readFileSync("apps/frontend/src/components/driver-profile/DriverTeamsReverseSection.tsx", "utf8");
const list = fs.readFileSync("apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", "utf8");

function failures(reverseSource = reverse, listSource = list, profileSource = profile) {
  return [
    ["profile mount", profileSource.includes('<DriverTeamsReverseSection driverId={id} operatingCompanyId={companyId}')],
    ["company-scoped roster", reverseSource.includes('listMdataDriverTeams({ operating_company_id: operatingCompanyId, is_active: "true" })')],
    ["both driver slots", reverseSource.includes("team.primary_driver_id === driverId") && reverseSource.includes("team.secondary_driver_id === driverId")],
    ["exact team drill", reverseSource.includes('kind="driver_team"') && reverseSource.includes("id={team.id}")],
    ["deep link honored", listSource.includes('searchParams.get("team_id")') && listSource.includes("candidate.id === teamId")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
}

if (process.argv.includes("--selftest")) {
  const badReverse = reverse.replace('kind="driver_team"', 'kind="driver"');
  const badList = list.replace("candidate.id === teamId", "candidate.id === companyId");
  const checks = [
    failures(badReverse, list, profile).includes("exact team drill"),
    failures(reverse, badList, profile).includes("deep link honored"),
  ];
  if (checks.some((ok) => !ok)) process.exit(1);
  console.log("verify-driver-team-profile-reverse selftest PASS — 2/2 membership/target mutations red");
  process.exit(0);
}

const missing = failures();
if (missing.length) {
  console.error(`verify-driver-team-profile-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-team-profile-reverse PASS — driver profile finds and opens exact team row");
