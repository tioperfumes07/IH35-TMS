#!/usr/bin/env node
import fs from "node:fs";

const FILES = {
  profile: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx",
  reverse: "apps/frontend/src/components/driver-profile/DriverTeamsReverseSection.tsx",
  list: "apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx",
  api: "apps/frontend/src/api/driver-teams.ts",
  backend: "apps/backend/src/mdata/driver-teams.routes.ts",
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
    ["failed roster retry", /<ListErrorState[\s\S]{0,260}onRetry=\{\(\) => void query\.refetch\(\)\}/.test(s.reverse)],
    ["deep link honored", s.list.includes('searchParams.get("team_id")') && s.list.includes("candidate.id === teamId")],
    ["GET clients require selected company", /getMdataDriverTeam\(id: string, operatingCompanyId: string\)[\s\S]{0,180}operating_company_id: operatingCompanyId/.test(s.api)],
    ["list backend requires selected company", /const listQuerySchema = z\.object\(\{[\s\S]{0,120}operating_company_id: z\.string\(\)\.uuid\(\),/.test(s.backend)],
    ["detail backend requires selected company", /const companyQuerySchema = z\.object\(\{ operating_company_id: z\.string\(\)\.uuid\(\) \}\)/.test(s.backend) && /app\.get\("\/api\/v1\/mdata\/driver-teams\/:id"[\s\S]{0,750}companyQuerySchema\.safeParse\(req\.query \?\? \{\}\)[\s\S]{0,750}parsedQuery\.data\.operating_company_id/.test(s.backend)],
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
    ["reverse", "onRetry={() => void query.refetch()}", "onRetry={() => undefined}"],
    ["list", "candidate.id === teamId", "candidate.id === companyId"],
    ["api", "getMdataDriverTeam(id: string, operatingCompanyId: string)", "getMdataDriverTeam(id: string)"],
    ["backend", "const listQuerySchema = z.object({\n  is_active: z.enum([\"true\", \"false\"]).optional(),\n  operating_company_id: z.string().uuid(),", "const listQuerySchema = z.object({\n  is_active: z.enum([\"true\", \"false\"]).optional(),\n  operating_company_id: z.string().uuid().optional(),"],
    ["backend", "// Bind the exact company selected by the caller. Falling back to the user's default company\n      // makes a valid team opened after an entity switch look missing (or resolves the wrong entity).\n      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid, parsedQuery.data.operating_company_id);", "// PLANTED default-company fallback\n      const scopedCompanyId = await resolveOperatingCompanyId(client, user.uuid);"],
    ["matrix", '"id": "catalog.drivers.teams.list"', '"id": "catalog.drivers.teams.list.broken"'],
  ];
  for (const [key, before, after] of mutations) {
    if (!source[key].includes(before)) throw new Error(`fixture missing: ${key}`);
    if (!failures({ ...source, [key]: source[key].replace(before, after) }).length) throw new Error(`mutation survived: ${key}`);
  }
  const feed = JSON.parse(source.feed);
  feed.entries.unshift({ task: "BROKEN", guard: FILES.self, modules: ["lists"], cols: ["reverse_link"], leafRe: "^catalog" });
  if (!failures({ ...source, feed: JSON.stringify(feed) }).length) throw new Error("feed mutation survived");
  console.log("verify-driver-team-profile-reverse selftest PASS — 11/11 runtime/evidence mutations red");
  process.exit(0);
}

const missing = failures(source);
if (missing.length) {
  console.error(`verify-driver-team-profile-reverse FAIL — ${missing.join(", ")}`);
  process.exit(1);
}
console.log("verify-driver-team-profile-reverse PASS — driver profile finds and opens exact team row");
