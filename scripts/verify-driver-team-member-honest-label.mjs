#!/usr/bin/env node
/** @matrix-built {"modules":["lists","drivers"],"cols":["driver","connectivity","reverse_link"],"leafRe":"^(catalog\\.drivers\\.teams\\.(list|create)|lists\\.modal\\.driver_team|profiles\\.detail)$","task":"DRIVER-TEAM-MEMBER-RAW-UUID-LABEL","vertical":"class-sweep"} */

import fs from "node:fs";

const LABEL = "verify-driver-team-member-honest-label";
const files = {
  api: fs.readFileSync("apps/frontend/src/api/driver-teams.ts", "utf8"),
  list: fs.readFileSync("apps/frontend/src/pages/lists/driver/DriverTeamsPage.tsx", "utf8"),
  modal: fs.readFileSync("apps/frontend/src/pages/lists/driver/DriverTeamModal.tsx", "utf8"),
  reverse: fs.readFileSync("apps/frontend/src/components/driver-profile/DriverTeamsReverseSection.tsx", "utf8"),
  profile: fs.readFileSync("apps/frontend/src/pages/drivers/DriverProfilePage.tsx", "utf8"),
};

function failures(candidate = files) {
  const found = [];
  if (!candidate.api.includes('import { entityLabel } from "../lib/entity-label"')) found.push("shared honest-label import is missing");
  if (!candidate.api.includes('const driverId = slot === "primary" ? team.primary_driver_id : team.secondary_driver_id')) found.push("both canonical driver slots are not resolved");
  if (!candidate.api.includes('return entityLabel(name, driverId, "Driver")')) found.push("driver-team member identity does not use entityLabel");
  if (/return name \|\| \(slot === "primary" \? team\.primary_driver_id : team\.secondary_driver_id\)/.test(candidate.api)) found.push("raw driver UUID remains a visible fallback");
  if (!candidate.list.includes('<DriverTeamMemberCell row={row} slot="primary" />')) found.push("Lists primary-driver drill loses governed member cell");
  if (!candidate.list.includes('<DriverTeamMemberCell row={row} slot="secondary" />')) found.push("Lists secondary-driver drill loses governed member cell");
  if (!candidate.list.includes('isUnresolvedEntityTombstone(rawName || null, driverId, "Driver")')) found.push("Lists member cell loses unresolved-driver tombstone policy");
  if (!candidate.list.includes('kind="driver"') || !candidate.list.includes("id={driverId}") || !candidate.list.includes("label={label}")) found.push("Lists member cell loses canonical resolved driver drill");
  if (!candidate.list.includes('listMdataDriverTeams({') || !candidate.list.includes("operating_company_id: companyId")) found.push("Lists roster is no longer company scoped");
  if (!candidate.modal.includes("new_driver_id: replacementDriverId") || !candidate.modal.includes("driver_slot: replaceSlot")) found.push("replacement no longer submits the canonical driver FK and slot");
  if (!candidate.reverse.includes('listMdataDriverTeams({ operating_company_id: operatingCompanyId, is_active: "true" })')) found.push("Driver profile reverse roster is no longer company scoped");
  if (!candidate.reverse.includes('kind="driver_team"') || !candidate.reverse.includes("id={team.id}")) found.push("Driver profile loses exact team drill");
  if (!candidate.reverse.includes('const teammateSlot = team.primary_driver_id === driverId ? "secondary" : "primary"')) found.push("Driver profile does not resolve the opposite teammate slot");
  if (!candidate.reverse.includes('teammateSlot === "primary" ? team.primary_driver_id : team.secondary_driver_id')) found.push("Driver profile teammate drill loses the canonical driver id");
  if (!candidate.reverse.includes('team.primary_driver_first_name') || !candidate.reverse.includes('team.secondary_driver_first_name') || !candidate.reverse.includes('team.primary_driver_last_name') || !candidate.reverse.includes('team.secondary_driver_last_name')) found.push("Driver profile teammate drill loses its scoped human name");
  if (!candidate.reverse.includes('<EntityLinkOrTombstone') || !candidate.reverse.includes('kind="driver"') || !candidate.reverse.includes('id={teammateId}') || !candidate.reverse.includes('name={teammateName}') || !candidate.reverse.includes('noun="Driver"')) found.push("Driver profile teammate remains dead text or loses unresolved-driver tombstone policy");
  if (!candidate.profile.includes('<DriverTeamsReverseSection driverId={id} operatingCompanyId={companyId}')) found.push("Driver profile loses mounted team reverse section");
  return found;
}

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutations = [
    ["api", 'import { entityLabel } from "../lib/entity-label";', "", "honest-label import"],
    ["api", 'return entityLabel(name, driverId, "Driver")', "return name || driverId", "raw UUID fallback"],
    ["list", '<DriverTeamMemberCell row={row} slot="primary" />', '<span>{row.primary_driver_id}</span>', "primary list member cell"],
    ["list", '<DriverTeamMemberCell row={row} slot="secondary" />', '<span>{row.secondary_driver_id}</span>', "secondary list member cell"],
    ["list", 'isUnresolvedEntityTombstone(rawName || null, driverId, "Driver")', "false", "unresolved member tombstone"],
    ["list", "id={driverId}", "id={undefined}", "resolved member driver FK"],
    ["modal", "new_driver_id: replacementDriverId", "new_driver_id: team.id", "replacement driver FK"],
    ["reverse", 'operating_company_id: operatingCompanyId', 'operating_company_id: ""', "reverse company scope"],
    ["reverse", 'kind="driver_team"', 'kind="driver"', "exact team drill"],
    ["reverse", 'id={teammateId}', 'id={team.id}', "teammate canonical driver FK"],
    ["reverse", 'name={teammateName}', 'name={teammateId}', "teammate human label"],
    ["reverse", '<EntityLinkOrTombstone', '<EntityLink', "teammate unresolved tombstone"],
    ["profile", '<DriverTeamsReverseSection driverId={id} operatingCompanyId={companyId}', '<DriverTeamsReverseSection driverId={id} operatingCompanyId=""', "profile reverse mount scope"],
  ];
  const escaped = [];
  for (const [key, needle, replacement, name] of mutations) {
    if (!files[key].includes(needle)) { escaped.push(`${key}: mutation anchor missing (${name})`); continue; }
    const mutant = { ...files, [key]: files[key].replace(needle, replacement) };
    if (failures(mutant).length === 0) escaped.push(`${key}: planted defect escaped (${name})`);
  }
  if (escaped.length) { console.error(`${LABEL} SELFTEST FAIL\n${escaped.join("\n")}`); process.exit(1); }
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} planted defects rejected`);
  process.exit(0);
}

const missing = failures();
if (missing.length) { console.error(`${LABEL} FAIL\n${missing.join("\n")}`); process.exit(1); }
console.log(`${LABEL} PASS — Lists and Driver profile resolve both team slots with honest labels and canonical drills`);
