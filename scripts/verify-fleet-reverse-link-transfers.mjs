#!/usr/bin/env node
/**
 * Fleet reverse_link — transfers list EntityLink F+R; create/edit modals honesty-dropped.
 *
 * @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["transfers.in_progress"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"}
 *
 * Self-test: node scripts/verify-fleet-reverse-link-transfers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-reverse-link-transfers";
const PAGE = "apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx";
const SERVICE = "apps/backend/src/mdata/equipment-transfer.service.ts";
const MATRIX = "docs/specs/scoreboard/modules/fleet.required.json";
const FEED = "docs/specs/scoreboard/wire-sprint-built.json";
const SELF = "scripts/verify-fleet-reverse-link-transfers.mjs";
const HEADER = ' * @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leaves":["transfers.in_progress"],"task":"CLASS-F5906-HIDDEN-TRANSFER-REVERSE-EXACT","vertical":"class-sweep"}';

function check(files) {
  const fails = [];
  if (!/EntityLinkOrTombstone kind="trailer" id=\{row\.equipment_id\} name=\{row\.equipment_number\}/.test(files.page)) fails.push(`${PAGE}: trailer drill must bind canonical id and label`);
  if (!/EntityLinkOrTombstone kind="driver" id=\{row\.from_driver_id\} name=\{row\.from_driver_name\}/.test(files.page)) fails.push(`${PAGE}: from-driver drill must bind canonical id and label`);
  if (!/EntityLinkOrTombstone kind="driver" id=\{row\.to_driver_id\} name=\{row\.to_driver_name\}/.test(files.page)) fails.push(`${PAGE}: to-driver drill must bind canonical id and label`);
  if (!/LEFT JOIN mdata\.drivers from_driver[\s\S]{0,500}transfer_from_dca\.driver_id = from_driver\.id[\s\S]{0,180}transfer_from_dca\.company_id = r\.operating_company_id[\s\S]{0,180}transfer_from_dca\.is_authorized = true[\s\S]{0,120}transfer_from_dca\.deactivated_at IS NULL/.test(files.service)) fails.push(`${SERVICE}: from-driver label must preserve an active company-authorized driver`);
  if (!/LEFT JOIN mdata\.drivers to_driver[\s\S]{0,500}transfer_to_dca\.driver_id = to_driver\.id[\s\S]{0,180}transfer_to_dca\.company_id = r\.operating_company_id[\s\S]{0,180}transfer_to_dca\.is_authorized = true[\s\S]{0,120}transfer_to_dca\.deactivated_at IS NULL/.test(files.service)) fails.push(`${SERVICE}: to-driver label must preserve an active company-authorized driver`);
  let matrix;
  try { matrix = JSON.parse(files.matrix); } catch (error) { fails.push(`Fleet matrix parse: ${error.message}`); }
  const leaf = matrix?.leaves?.find((row) => row.id === "transfers.in_progress");
  if (!leaf?.required?.includes("reverse_link")) fails.push("transfers.in_progress must require reverse_link");
  if (leaf?.route_hint !== "/fleet/transfers-in-progress") fails.push("transfers.in_progress must name mounted route /fleet/transfers-in-progress");
  if (!files.self.split('import fs from "node:fs";')[0].includes(HEADER)) fails.push("exact Fleet transfers header missing");
  try { if (JSON.parse(files.feed).entries?.some((entry) => entry.guard === SELF)) fails.push("manual feed duplicates Fleet transfers ownership"); }
  catch (error) { fails.push(`feed parse: ${error.message}`); }
  return fails;
}

const current = {
  page: fs.readFileSync(path.join(ROOT, PAGE), "utf8"),
  service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
  matrix: fs.readFileSync(path.join(ROOT, MATRIX), "utf8"),
  feed: fs.readFileSync(path.join(ROOT, FEED), "utf8"),
  self: fs.readFileSync(path.join(ROOT, SELF), "utf8"),
};

if (process.argv.includes("--selftest")) {
  const live = check(current);
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  const mutations = [
    { ...current, page: current.page.replace('kind="trailer" id={row.equipment_id}', 'kind="trailer" id={null}') },
    { ...current, page: current.page.replace('kind="driver" id={row.from_driver_id}', 'kind="driver" id={null}') },
    { ...current, page: current.page.replace('kind="driver" id={row.to_driver_id}', 'kind="driver" id={null}') },
    { ...current, service: current.service.replace("transfer_from_dca.is_authorized = true", "transfer_from_dca.is_authorized = false") },
    { ...current, service: current.service.replace("transfer_to_dca.is_authorized = true", "transfer_to_dca.is_authorized = false") },
    { ...current, matrix: current.matrix.replace('"id": "transfers.in_progress"', '"id": "transfers.in_progress.broken"') },
    { ...current, matrix: current.matrix.replace('"route_hint": "/fleet/transfers-in-progress"', '"route_hint": "/broken"') },
    { ...current, self: current.self.replace(HEADER, HEADER.replace('"vertical":"class-sweep"', '"vertical":"broken"')) },
    { ...current, feed: JSON.stringify({ entries: [{ guard: SELF }] }) },
  ];
  mutations.forEach((mutation, index) => {
    if (!check(mutation).length) {
      console.error(`${LABEL} SELFTEST FAIL — mutation ${index + 1} escaped`);
      process.exit(1);
    }
  });
  console.log(`${LABEL} SELFTEST PASS — ${mutations.length}/${mutations.length} runtime/evidence defects rejected`);
  process.exit(0);
}

const fails = check(current);
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet transfers reverse_link EntityLink ratcheted`);
