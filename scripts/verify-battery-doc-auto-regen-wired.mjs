#!/usr/bin/env node
/**
 * verify-battery-doc-auto-regen-wired.mjs
 * CC-1 CI artifact auto-regen (Round 8.23/8.24, 2026-11-13): docs/audit/USMCA-EXHAUSTIVE-BATTERY.md
 * must be regenerated inside the program-tracker-artifacts-sync workflow on EVERY sync run, so a
 * merge that adds/removes a create surface never leaves main red on verify-derived-artifact-freshness.
 *
 * Rules:
 *  1. The sync workflow calls gen-usmca-battery-doc.mjs as a step.
 *  2. The sync workflow stages docs/audit/USMCA-EXHAUSTIVE-BATTERY.md in the git add line.
 *  3. The sync workflow push trigger includes the battery doc's watch paths so a merge that adds
 *     a POST route fires the sync within seconds (not up to 6h on cron alone).
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const SELFTEST = process.argv.includes("--selftest");

const WF_PATH = resolve(".github/workflows/program-tracker-artifacts-sync.yml");

function check(label, pass, detail = "") {
  if (!pass) {
    console.error(`FAIL [${label}]${detail ? ": " + detail : ""}`);
    process.exit(1);
  }
  console.log(`PASS [${label}]`);
}

const BATTERY_WATCH_PATHS = ["apps/backend/src/**/*.ts", "apps/frontend/src/**/*.tsx", "scripts/usmca-create-surface-inventory.mjs"];

if (SELFTEST) {
  const src = readFileSync(WF_PATH, "utf8");

  // Plant 1: gen-usmca-battery-doc.mjs step removed
  const noStep = src.replace(/node scripts\/gen-usmca-battery-doc\.mjs/, "# removed");
  check("selftest:no-step:fails", !noStep.includes("node scripts/gen-usmca-battery-doc.mjs"));

  // Plant 2: USMCA-EXHAUSTIVE-BATTERY.md not in git add — replaceAll so the comment copy doesn't mask removal
  const noStage = src.replaceAll("docs/audit/USMCA-EXHAUSTIVE-BATTERY.md", "# removed");
  check("selftest:no-stage:fails", !noStage.includes("docs/audit/USMCA-EXHAUSTIVE-BATTERY.md"));

  // Plant 3: the push-path YAML line removed (replaceAll so comment copies don't mask it)
  const noPushPath = src.replaceAll(`- "${BATTERY_WATCH_PATHS[0]}"`, "# removed");
  check("selftest:no-push-path:fails", !noPushPath.includes(`- "${BATTERY_WATCH_PATHS[0]}"`));

  console.log("selftest: 3/3 PASS");
  process.exit(0);
}

const src = readFileSync(WF_PATH, "utf8");

// Rule 1: gen-usmca-battery-doc.mjs is called as a workflow step
check(
  "battery-regen:step-exists",
  src.includes("node scripts/gen-usmca-battery-doc.mjs"),
  ".github/workflows/program-tracker-artifacts-sync.yml must call node scripts/gen-usmca-battery-doc.mjs so the battery doc regenerates on every sync"
);

// Rule 2: USMCA-EXHAUSTIVE-BATTERY.md is staged in the git add line
check(
  "battery-regen:staged-in-git-add",
  src.includes("docs/audit/USMCA-EXHAUSTIVE-BATTERY.md"),
  ".github/workflows/program-tracker-artifacts-sync.yml must git add docs/audit/USMCA-EXHAUSTIVE-BATTERY.md so the refreshed doc lands in the auto-sync PR"
);

// Rule 3: push trigger includes every battery watch path so a route addition fires the sync within seconds
for (const watchPath of BATTERY_WATCH_PATHS) {
  check(
    `battery-regen:push-path:${watchPath}`,
    src.includes(`- "${watchPath}"`),
    `.github/workflows/program-tracker-artifacts-sync.yml push paths must include "${watchPath}" (battery doc watch); a merge adding a POST route would otherwise leave main red until the next 6h cron`
  );
}

console.log("verify-battery-doc-auto-regen-wired: PASS");
