#!/usr/bin/env node
/**
 * DISPATCH-NO-UI-DELIVERED-TRANSITION (P0): human-sequence load detail must call
 * PATCH …/transition via delivered_pending_docs — not labels/reads only.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DRAWER = path.join(ROOT, "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx");
const LABEL = "verify-dispatch-load-detail-deliver-transition";

function readDrawer() {
  return fs.readFileSync(DRAWER, "utf8");
}

export function assertLoadDetailDeliverTransition(source) {
  const fails = [];
  if (!/useUpdateLoadStatus/.test(source)) {
    fails.push("LoadDetailDrawer must use useUpdateLoadStatus for office deliver");
  }
  if (!/loadCanMarkDeliveredPendingDocs/.test(source)) {
    fails.push("LoadDetailDrawer must export loadCanMarkDeliveredPendingDocs eligibility helper");
  }
  if (!/new_status:\s*"delivered_pending_docs"/.test(source)) {
    fails.push('LoadDetailDrawer must transition to delivered_pending_docs (WIRE-07 stamp path)');
  }
  if (!/data-testid="load-detail-mark-delivered"/.test(source)) {
    fails.push("LoadDetailDrawer must expose load-detail-mark-delivered control");
  }
  if (!/Mark delivered \(pending docs\)/.test(source)) {
    fails.push("LoadDetailDrawer must label the deliver action for operators");
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const good = readDrawer();
  if (assertLoadDetailDeliverTransition(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — current drawer should pass`);
    process.exit(1);
  }
  const bad = good
    .replace('data-testid="load-detail-mark-delivered"', 'data-testid="removed"')
    .replace(/new_status:\s*"delivered_pending_docs"/, 'new_status: "delivered"');
  const planted = assertLoadDetailDeliverTransition(bad);
  if (!planted.length) {
    console.error(`${LABEL} SELFTEST FAIL — planted regression not detected`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
  process.exit(0);
}

const fails = assertLoadDetailDeliverTransition(readDrawer());
if (fails.length) {
  console.error(`${LABEL} FAIL`);
  for (const f of fails) console.error(` - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — load detail drawer wires delivered_pending_docs transition`);
