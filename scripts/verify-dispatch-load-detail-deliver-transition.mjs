#!/usr/bin/env node
/** DISPATCH-NO-UI-DELIVERED-TRANSITION — drawer consumes shared transition canon. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const SHARED = path.join(ROOT, "packages/shared-types/src/dispatch/load-state-machine.ts");
const LABEL = "verify-dispatch-load-detail-deliver-transition";

export function failures(drawer, shared) {
  const fails = [];
  if (!drawer.includes('import { getOfficeTransitionButtons } from "@ih35/shared-types"')) fails.push("drawer must import shared transition canon");
  if (!/getOfficeTransitionButtons\(load\.status\)\.map\(\(transition\)/.test(drawer)) fails.push("drawer must render every canonical transition button");
  if (!/body:\s*\{\s*new_status:\s*transition\.target\s*\}/.test(drawer)) fails.push("drawer must submit each canonical transition target");
  if (!/data-testid=\{transition\.testId\}/.test(drawer)) fails.push("drawer must expose canonical transition test ids");

  const transit = shared.getOfficeTransitionButtons("dispatched");
  if (!transit.some((b) => b.target === "in_transit" && b.label === "Mark in transit")) fails.push("canon must offer dispatched → in_transit");
  const delivered = shared.getOfficeTransitionButtons("in_transit");
  if (!delivered.some((b) => b.target === "delivered_pending_docs" && b.label === "Mark delivered (pending docs)")) fails.push("canon must offer in_transit → delivered_pending_docs");
  if (transit.some((b) => b.target === "delivered_pending_docs")) fails.push("canon must not offer delivered directly from dispatched");
  return fails;
}

const drawer = fs.readFileSync(DRAWER, "utf8");
const shared = await import(pathToFileURL(SHARED).href);

if (process.argv.includes("--selftest")) {
  if (failures(drawer, shared).length) {
    console.error(`${LABEL} SELFTEST FAIL — current canonical chain should pass`);
    process.exit(1);
  }
  const mutations = [
    drawer.replace("getOfficeTransitionButtons(load.status).map", "[].map"),
    drawer.replace("new_status: transition.target", 'new_status: "delivered_pending_docs"'),
    drawer.replace("data-testid={transition.testId}", 'data-testid="hardcoded"'),
  ];
  const survivors = mutations.filter((mutated) => failures(mutated, shared).length === 0);
  if (survivors.length) {
    console.error(`${LABEL} SELFTEST FAIL — ${survivors.length}/3 planted regressions survived`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS — 3/3 planted regressions rejected`);
  process.exit(0);
}

const found = failures(drawer, shared);
if (found.length) {
  console.error(`${LABEL} FAIL`);
  for (const failure of found) console.error(` - ${failure}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — shared canon drives in-transit and delivered controls`);
