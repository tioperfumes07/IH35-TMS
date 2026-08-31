#!/usr/bin/env node
/**
 * DispatchSubnav CountBadge must only render for exception/alert queues.
 * PLAN-04-DISPATCH-TAB-BADGES fix — non-alert tabs (load_board, assignments,
 * factoring, etc.) must NOT show count badges. Only ALERT_BADGE_KEYS tabs show.
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const filePath = path.join(root, "apps/frontend/src/components/dispatch/DispatchSubnav.tsx");
const src = readFileSync(filePath, "utf8");

const failures = [];

// Required: CountBadge must gate on ALERT_BADGE_KEYS
if (!src.includes("!ALERT_BADGE_KEYS.has(badgeKey)")) {
  failures.push("CountBadge missing ALERT_BADGE_KEYS gate — non-exception tabs would show badges");
}

// Required: ALERT_BADGE_KEYS must exist and contain the exception keys
if (!src.includes('ALERT_BADGE_KEYS = new Set(')) {
  failures.push("ALERT_BADGE_KEYS set not found");
}
if (!src.includes('"at_risk"') || !src.includes('"detention"') || !src.includes('"late"')) {
  failures.push("ALERT_BADGE_KEYS missing required exception keys (at_risk, detention, late)");
}

if (process.argv.includes("--selftest")) {
  const bad = src.replace("!ALERT_BADGE_KEYS.has(badgeKey)", "true /* selftest */");
  if (bad.includes("!ALERT_BADGE_KEYS.has(badgeKey)")) {
    console.error("selftest: could not plant failure");
    process.exit(1);
  }
  console.log("verify-dispatch-subnav-badges-exception-only selftest: planted failure would be detected");
  process.exit(0);
}

if (failures.length) {
  console.error("verify-dispatch-subnav-badges-exception-only FAIL:");
  for (const f of failures) console.error(" -", f);
  process.exit(1);
}

console.log("verify-dispatch-subnav-badges-exception-only: OK — CountBadge only renders for ALERT_BADGE_KEYS exception queues");
process.exit(0);
