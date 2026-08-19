#!/usr/bin/env node
/**
 * Fleet reverse_link — transfers list EntityLink F+R; create/edit modals honesty-dropped.
 *
 * @matrix-built {"modules":["fleet"],"cols":["reverse_link"],"leafRe":"^transfers\\.in_progress$","task":"VERTICAL-REVERSE-LINK-fleet-transfers","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-fleet-reverse-link-transfers.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-fleet-reverse-link-transfers";
const PAGE = "apps/frontend/src/pages/fleet/TransfersInProgressPage.tsx";

function check(src) {
  const fails = [];
  if (!/EntityLink(?:OrTombstone)?/.test(src)) fails.push(`${PAGE}: must import/render EntityLink`);
  if (!/kind="unit"/.test(src) && !/kind="trailer"/.test(src)) fails.push(`${PAGE}: must EntityLink unit or trailer (equipment_id)`);
  if (!/kind="driver"/.test(src) || (src.match(/kind="driver"/g) || []).length < 2) {
    fails.push(`${PAGE}: must EntityLink from_driver and to_driver`);
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const liveSrc = fs.readFileSync(path.join(ROOT, PAGE), "utf8");
  const live = check(liveSrc);
  const planted = check("// poison\n");
  if (planted.length < 2) {
    console.error(`${LABEL} SELFTEST FAIL`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = check(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — fleet transfers reverse_link EntityLink ratcheted`);
