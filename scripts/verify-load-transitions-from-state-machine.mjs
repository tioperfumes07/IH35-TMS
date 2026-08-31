#!/usr/bin/env node
/**
 * DISPATCH-OFFICE-TRANSITION-BUTTONS — LoadDetailDrawer must use shared load-state-machine canon.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const SHARED = path.join(ROOT, "packages/shared-types/src/dispatch/load-state-machine.ts");
const LABEL = "verify-load-transitions-from-state-machine";

const HARDcoded_STATUS_RE =
  /new_status:\s*"(unassigned|assigned_not_dispatched|dispatched|in_transit|delivered_pending_docs|completed_docs_received)"/g;

async function loadShared() {
  return import(pathToFileURL(SHARED).href);
}

export async function assertLoadTransitionsFromStateMachine(drawerSrc, shared) {
  const fails = [];
  const { ALLOWED_TRANSITIONS, OFFICE_DRAWER_EXCLUDED_TARGETS, getOfficeTransitionButtons, fromMdataStatus } =
    shared;

  if (!/@ih35\/shared-types/.test(drawerSrc)) {
    fails.push("LoadDetailDrawer must import transition canon from @ih35/shared-types");
  }
  if (!drawerSrc.includes("getOfficeTransitionButtons")) {
    fails.push("LoadDetailDrawer must render buttons via getOfficeTransitionButtons()");
  }
  if ([...drawerSrc.matchAll(HARDcoded_STATUS_RE)].length) {
    fails.push("LoadDetailDrawer hardcodes transition targets — use getOfficeTransitionButtons map");
  }
  if (!/data-testid=\{transition\.testId\}/.test(drawerSrc)) {
    fails.push("LoadDetailDrawer must bind data-testid from transition.testId");
  }

  for (const rawStatus of ["draft", "dispatched", "at_pickup", "in_transit", "at_delivery", "delivered_pending_docs"]) {
    const buttons = getOfficeTransitionButtons(rawStatus);
    const current = fromMdataStatus(rawStatus);
    const expected = ALLOWED_TRANSITIONS[current].filter((t) => !OFFICE_DRAWER_EXCLUDED_TARGETS.includes(t));
    if (buttons.length !== expected.length) {
      fails.push(`getOfficeTransitionButtons(${rawStatus}) length ${buttons.length} !== ${expected.length}`);
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const shared = await loadShared();
  const good = fs.readFileSync(DRAWER, "utf8");
  if ((await assertLoadTransitionsFromStateMachine(good, shared)).length) {
    console.error(`${LABEL} SELFTEST FAIL`);
    process.exit(1);
  }
  const bad =
    good.replace("data-testid={transition.testId}", 'data-testid="hardcoded"') +
    '\nbody: { new_status: "in_transit" },';
  const planted = await assertLoadTransitionsFromStateMachine(bad, shared);
  if (!planted.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted regression not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const shared = await loadShared();
const fails = await assertLoadTransitionsFromStateMachine(fs.readFileSync(DRAWER, "utf8"), shared);
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK`);
