#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  reverse: "apps/frontend/src/components/driver-profile/DriverTeamsReverseSection.tsx",
  list: "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx",
  matrix: "docs/specs/scoreboard/modules/lists.required.json",
  feed: "docs/specs/scoreboard/wire-sprint-built.json",
};
const source = Object.fromEntries(Object.entries(FILES).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));

function failures(s = source) {
  const found = [
    ["profile mount", s.profile.includes('<DriverTeamsReverseSection driverId={id} operatingCompanyId={companyId}')],
    ["company-scoped roster", s.reverse.includes('listMdataDriverTeams({ operating_company_id: operatingCompanyId, is_active: "true" })')],
    ["both driver slots", /team\.primary_driver_id === driverId \|\| team\.secondary_driver_id === driverId/.test(s.reverse)],
    ["exact team drill", s.reverse.includes('kind="driver_team"') && s.reverse.includes("id={team.id}")],
    ["deep link honored", s.list.includes('searchParams.get("team_id")') && s.list.includes("candidate.id === teamId")],
  ].filter(([, ok]) => !ok).map(([name]) => name);
  const matrix = JSON.parse(s.matrix);
  if (!matrix.leaves.find((leaf) => leaf.id === "catalog.drivers.teams.list")?.required?.includes("reverse_link")) found.push("Lists Required reverse cell missing");
  const feed = JSON.parse(s.feed);
  if ((feed.entries ?? []).some((entry) => entry.guard === FILES.self && entry.cols?.includes("reverse_link"))) found.push("duplicate manual reverse feed remains");
  return found;
}

if (process.argv.includes("--selftest")) {
  if (failures().length) throw new Error(`baseline failed: ${failures().join("; ")}`);
  const mutations = [
    ["profile", '<DriverTeamsReverseSection driverId={id} operatingCompanyId={companyId}', '<DriverTeamsReverseSection driverId={id} operatingCompanyId={undefined}'],
    ["reverse", 'listMdataDriverTeams({ operating_company_id: operatingCompanyId, is_active: "true" })', 'listMdataDriverTeams({ is_active: "true" })'],
    ["reverse", "team.primary_driver_id === driverId || team.secondary_driver_id === driverId", "false"],
    ["reverse", 'kind="driver_team"', 'kind="driver"'],
    ["list", "candidate.id === teamId", "candidate.id === companyId"],
    ["matrix", '"id": "catalog.drivers.teams.list"', '"id": "catalog.drivers.teams.list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`fixture missing: ${key}`);
    if (!failures({ ...source, [key]: source[key].replace(before, after) }).length) throw new Error(`mutation survived: ${key}`);
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ task: "BROKEN", guard: FILES.self, modules: ["lists"], cols: ["reverse_link"], leafRe: "^catalog" });
  if (!failures({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("verify-driver-team-profile-reverse selftest PASS — 8/8 runtime/evidence mutations red");
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-driver-team-profile-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-team-profile-reverse PASS — driver profile finds and opens exact team row");
