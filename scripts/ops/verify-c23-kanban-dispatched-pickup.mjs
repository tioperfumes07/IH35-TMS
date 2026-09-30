#!/usr/bin/env node
/**
 * C-23 — Kanban Dispatched → At pickup drag: Manual stamp must move the card (ops lane).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const fail = (m) => {
  console.error(`FAIL: ${m}`);
  process.exit(1);
};
const ok = (m) => console.log(`PASS: ${m}`);
const read = (rel) => fs.readFileSync(path.join(root, rel), "utf8");

function assertIncludes(rel, needles, label) {
  const src = read(rel);
  for (const n of needles) {
    if (!src.includes(n)) fail(`${label}: missing ${JSON.stringify(n)} in ${rel}`);
  }
  ok(label);
}

if (!process.argv.includes("--selftest")) {
  console.log("usage: node scripts/ops/verify-c23-kanban-dispatched-pickup.mjs --selftest");
  process.exit(0);
}

assertIncludes(
  "apps/frontend/src/components/dispatch/DispatchKanban.tsx",
  [
    "optimisticGeofenceAfterManualStamp",
    "stampOverrides",
    "data-c23-drop-target",
    "min-h-[120px]",
  ],
  "C-23 stamp overlay + min-height drop targets",
);

assertIncludes(
  "apps/frontend/src/components/dispatch/DispatchKanban.test.tsx",
  ["C-23 — Dispatched → At pickup Manual stamp moves the card", "at_pickup"],
  "C-23 unit tests cover column key after stamp",
);

console.log("verify-c23-kanban-dispatched-pickup --selftest OK");
