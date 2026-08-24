#!/usr/bin/env node
/**
 * DISP-F6157-QUICKSAVE-DRIVER-UUID-WRITTEN-AS-TRAILER-FK — reassignUnit and reassignDriver in
 * quicksave.service.ts wrote load.assigned_secondary_driver_id (the co-driver FK -> mdata.drivers)
 * into dispatch.load_assignment_history.previous_trailer_id/new_trailer_id (FK -> mdata.equipment).
 * A load with a co-driver failed the otherwise-unrelated unit/driver quicksave with a trailer FK
 * violation; without a co-driver the write recorded NULL and lost the existing trailer history.
 * Both call sites must resolve the canonical trailer from history instead (the same pattern
 * reassignTrailer already used for its own previous_trailer_id).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-dispatch-quicksave-trailer-not-codriver-uuid";
const FILE = "apps/backend/src/dispatch/assignments/quicksave.service.ts";

export function collectProblems(src) {
  const problems = [];
  if (src.includes("previous_trailer_id: load.assigned_secondary_driver_id")) {
    problems.push(`${FILE}: must never write load.assigned_secondary_driver_id (co-driver FK) into previous_trailer_id (equipment FK) — the exact DISP-F6157 regression`);
  }
  if (src.includes("new_trailer_id: load.assigned_secondary_driver_id")) {
    problems.push(`${FILE}: must never write load.assigned_secondary_driver_id (co-driver FK) into new_trailer_id (equipment FK) — the exact DISP-F6157 regression`);
  }
  if (!src.includes("async function resolveCanonicalTrailerId")) {
    problems.push(`${FILE}: must resolve the canonical trailer from dispatch.load_assignment_history.new_trailer_id, not project the co-driver uuid`);
  }
  const callSites = (src.match(/resolveCanonicalTrailerId\(client, input\.load_uuid\)/g) || []).length;
  if (callSites < 3) {
    problems.push(`${FILE}: resolveCanonicalTrailerId must be called from all three reassign* functions (found ${callSites}, need 3)`);
  }
  return problems;
}

const good = `
async function resolveCanonicalTrailerId(client, loadId) {
  const res = await client.query(
    \`SELECT new_trailer_id::text FROM dispatch.load_assignment_history WHERE load_id = $1::uuid AND new_trailer_id IS NOT NULL ORDER BY created_at DESC LIMIT 1\`,
    [loadId]
  );
  return res.rows[0]?.new_trailer_id ?? null;
}
export async function reassignUnit() {
  const canonicalTrailerId = await resolveCanonicalTrailerId(client, input.load_uuid);
  await recordAssignment(client, { previous_trailer_id: canonicalTrailerId, new_trailer_id: canonicalTrailerId });
}
export async function reassignTrailer() {
  const previousTrailerId = await resolveCanonicalTrailerId(client, input.load_uuid);
  await recordAssignment(client, { previous_trailer_id: previousTrailerId, new_trailer_id: input.trailer_uuid });
}
export async function reassignDriver() {
  const canonicalTrailerId = await resolveCanonicalTrailerId(client, input.load_uuid);
  await recordAssignment(client, { previous_trailer_id: canonicalTrailerId, new_trailer_id: canonicalTrailerId });
}
`;
const bad = `
export async function reassignUnit() {
  await recordAssignment(client, {
    previous_trailer_id: load.assigned_secondary_driver_id,
    new_trailer_id: load.assigned_secondary_driver_id,
  });
}
`;

if (process.argv.includes("--selftest")) {
  if (collectProblems(good).length) {
    console.error(`${LABEL} --selftest FAIL good`);
    process.exit(1);
  }
  if (collectProblems(bad).length < 3) {
    console.error(`${LABEL} --selftest FAIL bad too weak`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const src = fs.readFileSync(path.join(ROOT, FILE), "utf8");
const problems = collectProblems(src);
if (problems.length) {
  console.error(`${LABEL}: FAIL\n${problems.map((p) => `  - ${p}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL}: PASS — quicksave never writes the co-driver uuid into trailer history`);
process.exit(0);
