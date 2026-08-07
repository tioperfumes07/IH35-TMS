#!/usr/bin/env node
/**
 * GUARD — every dispatch Kanban lane's `dropStatus` must be a status the load-status endpoint accepts.
 *
 * WHY THIS EXISTS, and it is worth being blunt about it: CC-3 filed LV-TXN-005 claiming the board
 * rendered a "Loaded" lane whose drop the API rejected with HTTP 400. That claim was WRONG. The API
 * does reject `new_status: 'loaded'` — that part was measured correctly — but the Loaded lane never
 * sends it: the lane carries `statuses: []` and `dropStatus: "in_transit"`, so it is a visual staging
 * column whose drop is valid. The defect was inferred from one true fact plus an assumption about the
 * other end, and nobody could cheaply check the pair.
 *
 * This guard is that cheap check. It cross-references the two ends that must agree:
 *   FRONTEND  apps/frontend/src/components/dispatch/DispatchKanban.tsx  → KANBAN_STATUS_GROUPS[].dropStatus
 *   BACKEND   apps/backend/src/mdata/loads.routes.ts                    → loadStatusSchema = z.enum([...])
 *
 * A lane whose drop the endpoint rejects is a silent dead end: the dispatcher drags a card, the request
 * 400s, and the board springs back with no explanation. Today all 11 lanes are valid — this guard keeps
 * it that way when someone adds a lane or tightens the enum, which are separate files owned by separate
 * lanes and therefore drift independently.
 *
 * NOT CLAIMED: this proves the STATUS STRING is accepted by the schema. It does not prove the state
 * machine permits that particular transition from the card's current status — `validateLoadStatusWrite`
 * owns that, and a legal status can still be an illegal transition.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-kanban-dropstatus-contract";
const FE = "apps/frontend/src/components/dispatch/DispatchKanban.tsx";
const BE = "apps/backend/src/mdata/loads.routes.ts";

export function acceptedStatuses(backendSrc) {
  const m = backendSrc.match(/const loadStatusSchema = z\.enum\(\[([\s\S]*?)\]\)/);
  if (!m) return null;
  return [...m[1].matchAll(/"([a-z_]+)"/g)].map((x) => x[1]);
}

export function laneDrops(frontendSrc) {
  return [...frontendSrc.matchAll(/title:\s*"([^"]+)"[^}]*?dropStatus:\s*"([a-z_]+)"/g)].map((x) => ({
    lane: x[1],
    drop: x[2],
  }));
}

export function audit(frontendSrc, backendSrc) {
  const accepted = acceptedStatuses(backendSrc);
  if (!accepted || accepted.length === 0) {
    return [`${BE}: could not read loadStatusSchema z.enum — refusing to pass vacuously.`];
  }
  const lanes = laneDrops(frontendSrc);
  if (lanes.length === 0) {
    return [`${FE}: found ZERO Kanban lanes with a dropStatus — scope is wrong, refusing to pass vacuously.`];
  }
  return lanes
    .filter((l) => !accepted.includes(l.drop))
    .map(
      (l) =>
        `${FE}: lane "${l.lane}" drops to "${l.drop}", which loadStatusSchema does not accept. ` +
        `Dragging a card there 400s and the board springs back with no explanation. ` +
        `Accepted: ${accepted.join(", ")}.`,
    );
}

if (process.argv.includes("--selftest")) {
  const be = `const loadStatusSchema = z.enum([\n  "assigned",\n  "in_transit",\n  "delivered_pending_docs",\n]);`;
  const good = `{ key: "a", title: "Assigned", statuses: ["assigned"], dropStatus: "assigned" },
                { key: "b", title: "Loaded", statuses: [], dropStatus: "in_transit" },`;
  const bad = `{ key: "b", title: "Loaded", statuses: [], dropStatus: "loaded" },`;
  const cases = [
    ["all lanes valid", good, be, 0],
    ["a lane dropping to a rejected status", bad, be, 1],
    ["both a valid and an invalid lane", good + bad, be, 1],
    ["backend enum unreadable", good, "const somethingElse = 1;", 1],
    ["no lanes found — must not pass vacuously", "", be, 1],
  ];
  let failed = 0;
  for (const [name, fe, beSrc, want] of cases) {
    const got = audit(fe, beSrc).length;
    if (got !== want) {
      console.error(`SELFTEST FAIL: ${name} — expected ${want}, got ${got}`);
      failed++;
    }
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length} mutations detected correctly`);
  process.exit(0);
}

for (const rel of [FE, BE]) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`${LABEL} FAIL — missing ${rel}; scope is wrong, refusing to pass vacuously.`);
    process.exit(1);
  }
}

const problems = audit(fs.readFileSync(path.join(ROOT, FE), "utf8"), fs.readFileSync(path.join(ROOT, BE), "utf8"));
if (problems.length) {
  console.error(`${LABEL} FAIL — a Kanban lane drops to a status the API rejects:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  console.error(`\nFix: change the lane's dropStatus, or add the status to loadStatusSchema if it is genuinely valid.\n`);
  process.exit(1);
}

const lanes = laneDrops(fs.readFileSync(path.join(ROOT, FE), "utf8"));
console.log(`${LABEL} OK — all ${lanes.length} Kanban lane drops are accepted by loadStatusSchema.`);
process.exit(0);
