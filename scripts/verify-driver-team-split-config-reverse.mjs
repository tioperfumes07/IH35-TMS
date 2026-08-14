#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["reverse_link"],"leafRe":"^drivers\\.panel\\.team_split_config$","task":"VERTICAL-REVERSE-LINK-DRIVER-TEAM-SPLIT-CONFIG"} */
import fs from "node:fs";
const read = (path) => fs.readFileSync(path, "utf8");
const files = {
  routes: read("apps/backend/src/settlements/team-splits/team-splits.routes.ts"),
  hook: read("apps/frontend/src/hooks/useTeamSplits.ts"),
  reverse: read("apps/frontend/src/components/driver-profile/DriverTeamSplitConfigReverseSection.tsx"),
  profile: read("apps/frontend/src/pages/drivers/DriverProfilePage.tsx"),
  panel: read("apps/frontend/src/pages/drivers/TeamSplitConfig.tsx"),
};
function failures(s = files) { return [
  ["company-scoped driver filter", s.routes.includes("driver_id: z.string().uuid().optional()") && s.routes.includes("t.primary_driver_id = $${values.length}::uuid OR t.secondary_driver_id = $${values.length}::uuid") && s.hook.includes('params.set("driver_id", filters.driver_id)')],
  ["profile filtered canonical read", s.reverse.includes("listTeamSplitConfigs(operatingCompanyId, { driver_id: driverId })") && s.reverse.includes('queryKey: ["team-split-configs", "driver-profile", operatingCompanyId, driverId]')],
  ["profile reverse mount", s.profile.includes("<DriverTeamSplitConfigReverseSection driverId={id} operatingCompanyId={companyId} />")],
  ["exact config drill", s.reverse.includes('kind="driver_team_split"') && s.reverse.includes('id={config.id}') && s.panel.includes('searchParams.get("team_id")') && s.panel.includes("row.id === teamId")],
  ["driver target preserved", s.reverse.includes('kind="driver_team_splits_filter"') && s.reverse.includes('id={driverId}') && s.panel.includes('searchParams.get("driver_id")') && s.panel.includes("row.primary_driver_id === driverId || row.secondary_driver_id === driverId")],
  ["honest panel failure state", s.panel.includes("Team split configurations unavailable.") && s.panel.includes("!isLoading && !isError") && s.panel.includes("void refetch()")],
].filter(([, ok]) => !ok).map(([name]) => name); }
if (process.argv.includes("--selftest")) {
  const checks = [
    failures({ ...files, routes: files.routes.replace("t.primary_driver_id = $${values.length}::uuid", "FALSE") }).includes("company-scoped driver filter"),
    failures({ ...files, reverse: files.reverse.replace("listTeamSplitConfigs(operatingCompanyId, { driver_id: driverId })", "listTeamSplitConfigs(operatingCompanyId)") }).includes("profile filtered canonical read"),
    failures({ ...files, profile: "" }).includes("profile reverse mount"),
    failures({ ...files, panel: files.panel.replace("row.id === teamId", "true") }).includes("exact config drill"),
    failures({ ...files, reverse: files.reverse.replace('kind="driver_team_splits_filter"', 'kind="driver"') }).includes("driver target preserved"),
    failures({ ...files, panel: files.panel.replace("!isLoading && !isError", "!isLoading") }).includes("honest panel failure state"),
  ];
  if (checks.some((ok) => !ok)) { console.error(`verify-driver-team-split-config-reverse selftest FAIL — mutations ${checks.map((ok, i) => ok ? null : i + 1).filter(Boolean).join(", ")} stayed green`); process.exit(1); }
  console.log("verify-driver-team-split-config-reverse selftest PASS — 6/6 filter/profile/target/error mutations red"); process.exit(0);
}
const missing = failures();
if (missing.length) { console.error(`verify-driver-team-split-config-reverse FAIL — ${missing.join(", ")}`); process.exit(1); }
console.log("verify-driver-team-split-config-reverse PASS — driver profiles return to exact canonical team-split configs");
