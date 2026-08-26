#!/usr/bin/env node
/** @matrix-built {"modules":["maintenance","fleet"],"cols":["trailer","connectivity","reverse_link","picker_law"],"leafRe":"^tires\\.(create|create_record)$|^trailer\\.profile\\.maintenance$|^unit\\.detail\\.tires$","task":"THEATER-TRAILER-TIRE-PROGRAM-LEAFRE","vertical":"column-wave"} */
import fs from "node:fs";
const LABEL = "verify-trailer-tire-program-linkage";
const files = {
  route: "apps/backend/src/maintenance/tires.routes.ts",
  page: "apps/frontend/src/pages/maintenance/TireProgramPage.tsx",
  api: "apps/frontend/src/api/maintenance.ts",
  reverse: "apps/frontend/src/components/maintenance/TrailerTiresReverseSection.tsx",
  profile: "apps/frontend/src/pages/fleet/TrailerProfilePage.tsx",
};
const source = Object.fromEntries(Object.entries(files).map(([key, file]) => [key, fs.readFileSync(file, "utf8")]));
function audit(s) {
  const failures = [];
  if (!/assetKind.*"unit" \| "trailer"/.test(s.page) || !/kind=\{assetKind\}/.test(s.page)) failures.push("tire creator must select unit or trailer canonically");
  if (!/equipment_id: input\.assetId/.test(s.page) || !/createMaintenanceTireRecord\([\s\S]{0,260}input\.assetKind === "trailer"/.test(s.page)) failures.push("trailer selection must reach create payload");
  if (!/searchParams\.get\("equipment_id"\)/.test(s.page)) failures.push("canonical tire page must consume exact trailer deep-link");
  // LST-F5200 — asset selection must write URL.
  if (!/setSearchParams/.test(s.page) || !/writeAssetToUrl/.test(s.page)) failures.push("tire page must write unit_id/equipment_id to URL");
  if (!/FROM mdata\.equipment[\s\S]{0,200}COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid[\s\S]{0,100}deactivated_at IS NULL/.test(s.route)) failures.push("writer must validate active tenant trailer");
  if (!/position_asset_mismatch/.test(s.route)) failures.push("writer must reject unit/trailer position mismatch");
  if (!/INSERT INTO maintenance\.tire_records[\s\S]{0,140}equipment_id/.test(s.route)) failures.push("writer must persist equipment_id");
  if (!/listMaintenanceTireRecords\(operatingCompanyId, \{ equipment_id: equipmentId \}\)/.test(s.reverse)) failures.push("trailer profile reverse must request exact equipment_id set");
  if (!/ListErrorBanner/.test(s.reverse) || !/No active tires are linked/.test(s.reverse)) failures.push("reverse surface must preserve honest states");
  if (!/kind="tire_program_equipment"/.test(s.reverse) || !/id=\{equipmentId\}/.test(s.reverse)) failures.push("reverse row must drill via EntityLink tire_program_equipment");
  if (!/TrailerTiresReverseSection/.test(s.profile)) failures.push("trailer profile must mount tire reverse section");
  if (!/params: \{ unit_id\?: string; equipment_id\?: string; include_archived\?: boolean \}/.test(s.api)) failures.push("client must expose exact equipment filter");
  return failures;
}
if (process.argv.includes("--selftest")) {
  const mutations = [
    ["picker", "page", /kind=\{assetKind\}/, 'kind="unit"'],
    ["payload", "page", /equipment_id: input\.assetId/, "unit_id: input.assetId"],
    ["deep-link", "page", /searchParams\.get\("equipment_id"\)/, 'searchParams.get("unit_id")'],
    ["url-write", "page", /writeAssetToUrl/g, "noopAssetUrl"],
    ["scope", "route", /COALESCE\(currently_leased_to_company_id, owner_company_id\) = \$2::uuid/g, "TRUE"],
    ["position", "route", /position_asset_mismatch/, "invalid_position"],
    ["reverse", "reverse", /listMaintenanceTireRecords\(operatingCompanyId, \{ equipment_id: equipmentId \}\)/, "listMaintenanceTireRecords(operatingCompanyId)"],
    ["error", "reverse", /ListErrorBanner/g, "MissingError"],
    ["drill", "reverse", /kind="tire_program_equipment"/g, 'kind="unit"'],
    ["mount", "profile", /TrailerTiresReverseSection/g, "MissingTrailerTires"],
  ];
  for (const [name, key, pattern, replacement] of mutations) {
    const changed = { ...source, [key]: source[key].replace(pattern, replacement) };
    if (changed[key] === source[key] || audit(changed).length === 0) { console.error(`${LABEL} SELFTEST FAIL — ${name}`); process.exit(1); }
  }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length} mutations detected`); process.exit(0);
}
const failures = audit(source);
if (failures.length) { console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`); process.exit(1); }
console.log(`${LABEL} PASS — trailer picker→tenant writer→exact reverse→tire program drill`);
