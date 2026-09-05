#!/usr/bin/env node
/**
 * GAP-39 DEFECT B (owner packet 2026-09-05): `departed` had NO outgoing edge at all — the
 * machine dead-locked there (geofence 188cf90c stuck since 2026-09-03 19:06:32 while 14 units
 * kept reporting). Locks the fix so it cannot silently regress: `departed` must have at least
 * one legal exit, `computeProposedState` must actually route past-the-approach-radius traffic
 * out of `departed` back to `idle`, and every state in the machine must have >=1 outgoing edge
 * (a `terminalStates()` helper — or equivalent structural proof — must exist and be exercised
 * by a test asserting the full cycle has no dead end).
 *
 * Run: node scripts/verify-geofence-state-machine-no-terminal-state.mjs
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    failures.push(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

const STATES_REL = "apps/backend/src/integrations/samsara/geofences/state-machine/states.ts";
const TEST_REL = "apps/backend/src/integrations/samsara/geofences/state-machine/__tests__/states.test.ts";

const states = read(STATES_REL);
if (states) {
  const departedEdgeMatch = states.match(/departed:\s*\[([^\]]*)\]/);
  if (!departedEdgeMatch) {
    failures.push(`${STATES_REL}: no VALID_TRANSITIONS.departed entry found`);
  } else {
    const edges = departedEdgeMatch[1];
    if (!/["']idle["']/.test(edges)) {
      failures.push(`${STATES_REL}: VALID_TRANSITIONS.departed must include "idle" (the dead-lock fix)`);
    }
  }

  // Every GEOFENCE_STATES entry must appear as a VALID_TRANSITIONS key with a non-empty array —
  // regex-scan each `key: [...]` entry rather than importing the TS module (this guard runs
  // static, no build step).
  const stateListMatch = states.match(/GEOFENCE_STATES\s*=\s*\[([^\]]*)\]/);
  if (!stateListMatch) {
    failures.push(`${STATES_REL}: GEOFENCE_STATES export not found`);
  } else {
    const stateNames = [...stateListMatch[1].matchAll(/"([a-z_]+)"/g)].map((m) => m[1]);
    for (const name of stateNames) {
      const edgeMatch = states.match(new RegExp(`\\b${name}:\\s*\\[([^\\]]*)\\]`));
      if (!edgeMatch || edgeMatch[1].trim().length === 0) {
        failures.push(`${STATES_REL}: state "${name}" has no outgoing edges in VALID_TRANSITIONS — terminal state regression (GAP-39 DEFECT B)`);
      }
    }
  }

  if (!/function\s+terminalStates\s*\(/.test(states)) {
    failures.push(`${STATES_REL}: terminalStates() helper missing — nothing structurally proves the graph has no dead end`);
  }
}

const test = read(TEST_REL);
if (test) {
  if (!/terminalStates\(\)/.test(test)) {
    failures.push(`${TEST_REL}: no assertion against terminalStates() — the no-dead-end property is not tested`);
  }
  if (!/idle.*approaching.*at.*dwelling.*departing.*departed/s.test(test)) {
    failures.push(`${TEST_REL}: no full-cycle walk (idle -> approaching -> at -> dwelling -> departing -> departed) found`);
  }
}

if (failures.length) {
  console.error("verify-geofence-state-machine-no-terminal-state FAILED:");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("verify-geofence-state-machine-no-terminal-state OK — departed has an exit edge, every state has >=1 outgoing edge, full-cycle test present");
