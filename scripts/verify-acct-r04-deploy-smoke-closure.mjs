#!/usr/bin/env node
/**
 * ACCT-R-04 / ACCT-F15 — G4 deploy smoke closure (verify-step 1704).
 *
 * Repo wiring for preDeploy ci:boot-aggregate-smoke must declare stable env keys in render.yaml
 * AND hide archived test-owner emails from production identity.users listings.
 *
 * Sub-guards:
 *   - scripts/verify-g4-deploy-smoke-env-in-render.mjs (IH35_SMOKE_UNIT_ID + OPERATING_COMPANY_ID)
 *   - scripts/verify-no-test-users-in-production-list.mjs (integration.owner@test.invalid filter)
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-acct-r04-deploy-smoke-closure";

const SUB_GUARDS = [
  "scripts/verify-g4-deploy-smoke-env-in-render.mjs",
  "scripts/verify-no-test-users-in-production-list.mjs",
];

function runNode(script, extraArgs = []) {
  const res = spawnSync(process.execPath, [path.join(ROOT, script), ...extraArgs], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  });
  if (res.status !== 0) {
    const detail = (res.stderr || res.stdout || "").trim();
    console.error(`${LABEL} FAIL via ${script}${extraArgs.length ? ` ${extraArgs.join(" ")}` : ""}`);
    if (detail) console.error(detail);
    process.exit(1);
  }
}

function selftest() {
  for (const script of SUB_GUARDS) {
    const full = path.join(ROOT, script);
    if (!fs.existsSync(full)) {
      console.error(`${LABEL} --selftest FAIL missing ${script}`);
      process.exit(1);
    }
  }
  runNode(SUB_GUARDS[0], ["--selftest"]);
  console.log(`${LABEL} --selftest PASS (${SUB_GUARDS.length} sub-guards present; render env selftest ran)`);
}

function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  for (const script of SUB_GUARDS) {
    runNode(script);
  }
  console.log(
    `${LABEL} OK — render.yaml smoke env keys declared; identity.users excludes archived test seeds.`,
  );
}

main();
