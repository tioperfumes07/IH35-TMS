#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["drivers.panel.team_split_config"],"task":"DRV-F5877-TEAM-SPLIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/settlements/team-splits/team-splits.routes.ts"),
  service: read("apps/backend/src/mdata/driver-team.service.ts"),
  hook: read("apps/frontend/src/hooks/useTeamSplits.ts"),
  reverse: read("apps/frontend/src/components/driver-profile/DriverTeamSplitConfigReverseSection.tsx"),
  profile: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  panel: read("apps/frontend/src/pages/drivers/TeamSplitConfig.tsx"),
  matrix: read("docs/specs/scoreboard/modules/drivers.required.json"),
  self: read("scripts/verify-driver-team-split-config-reverse.mjs"),
};
const HEADER = '/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leaves":["drivers.panel.team_split_config"],"task":"DRV-F5877-TEAM-SPLIT-REVERSE-EXACT-LEAF","vertical":"column-wave"} */';
function failures(s = files) { return [
  ["company-scoped driver filter", s.routes.includes("driver_id: z.string().uuid().optional()") && s.routes.includes("t.primary_driver_id = $${values.length}::uuid OR t.secondary_driver_id = $${values.length}::uuid") && s.hook.includes('params.set("driver_id", filters.driver_id)')],
  ["profile filtered canonical read", s.reverse.includes("listTeamSplitConfigs(operatingCompanyId, { driver_id: driverId })") && s.reverse.includes('queryKey: ["team-split-configs", "driver-profile", operatingCompanyId, driverId]')],
  ["profile reverse mount", s.profile.includes("<DriverTeamSplitConfigReverseSection driverId={id} operatingCompanyId={companyId} />")],
  ["exact config drill", s.reverse.includes('kind="driver_team_split"') && s.reverse.includes('id={config.id}') && s.panel.includes('searchParams.get("team_id")') && s.panel.includes("row.id === teamId")],
  ["driver target preserved", s.reverse.includes('kind="driver_team_splits_filter"') && s.reverse.includes('id={driverId}') && s.panel.includes('searchParams.get("driver_id")') && s.panel.includes("row.primary_driver_id === driverId || row.secondary_driver_id === driverId")],
  ["honest panel failure state", s.panel.includes("Team split configurations unavailable.") && s.panel.includes("!isLoading && !isError") && s.panel.includes("void refetch()")],
  // LST-F5185 — list reverse filter must be EntityPicker + URL write
  ["visible driver EntityPicker filter", s.panel.includes('dataTestId="team-split-config-filter-driver"') && s.panel.includes("allowCreate={false}") && s.panel.includes("setSearchParams") && s.panel.includes("EntityPicker")],
  // LV-DRIVERS-TEAM-SPLIT-NULL-IDENTITY — opco-only membership (no uca join on nullable identity_user_id)
  ["assertDriverCompany opco-only", /FROM mdata\.drivers d\s+WHERE d\.id = \$1\s+AND d\.operating_company_id = \$2::uuid/.test(s.service) && !/FROM mdata\.drivers d\s+JOIN org\.user_company_access/.test(s.service)],
  ["exact Required ownership", (() => { try { return JSON.parse(s.matrix).leaves?.find((leaf) => leaf.id === "drivers.panel.team_split_config")?.required?.includes("reverse_link"); } catch { return false; } })()],
  ["exact Built header", s.self.split("\n").includes(HEADER)],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("t.primary_driver_id = $${values.length}::uuid", "FALSE") }).includes("company-scoped driver filter"),
    failures({ ...files, reverse: files.reverse.replace("listTeamSplitConfigs(operatingCompanyId, { driver_id: driverId })", "listTeamSplitConfigs(operatingCompanyId)") }).includes("profile filtered canonical read"),
    failures({ ...files, profile: "" }).includes("profile reverse mount"),
    failures({ ...files, panel: files.panel.replace("row.id === teamId", "true") }).includes("exact config drill"),
    failures({ ...files, reverse: files.reverse.replace('kind="driver_team_splits_filter"', 'kind="driver"') }).includes("driver target preserved"),
    failures({ ...files, panel: files.panel.replace("!isLoading && !isError", "!isLoading") }).includes("honest panel failure state"),
    failures({ ...files, panel: files.panel.replace('dataTestId="team-split-config-filter-driver"', 'dataTestId="gone"') }).includes("visible driver EntityPicker filter"),
    failures({ ...files, service: files.service.replace("AND d.operating_company_id = $2::uuid", "AND FALSE") }).includes("assertDriverCompany opco-only"),
    failures({ ...files, matrix: files.matrix.replace('"id": "drivers.panel.team_split_config"', '"id": "drivers.panel.team_split_config.removed"') }).includes("exact Required ownership"),
    failures({ ...files, self: files.self.replace(HEADER, `${HEADER}.removed`) }).includes("exact Built header"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-driver-team-split-config-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-driver-team-split-config-reverse selftest PASS — 10/10 runtime/evidence mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-driver-team-split-config-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-driver-team-split-config-reverse PASS — driver profiles return to exact canonical team-split configs");
