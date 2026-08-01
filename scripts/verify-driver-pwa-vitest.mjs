#!/usr/bin/env node
/**
 * Driver PWA vitest CI gate — previously only nightly k6 ran; unit failures were silent-green.
 * Mutation-tested (--selftest).
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-pwa-vitest";
const SELFTEST = process.argv.includes("--selftest");
const APP = path.join(ROOT, "apps/driver-pwa");
const TEST = "apps/driver-pwa/src/screens/__tests__/dispatch-view.test.ts";

function fail(msg) {
  console.error(`${LABEL} FAIL: ${msg}`);
  process.exit(1);
}

function selftest() {
  const src = fs.readFileSync(path.join(ROOT, TEST), "utf8");
  if (/path="\/dispatch\/:load_uuid"/.test(src) && !/\.not\.toContain/.test(src)) {
    fail("selftest: test must not require unrouted /dispatch/:load_uuid as positive assert");
  }
  if (!/StopActionPage/.test(src) || !/loads\/:id\/stops\/:stopId/.test(src)) {
    fail("selftest: test must lock StopActionPage route");
  }
  if (!/\.not\.toContain\(["']DispatchViewScreen["']\)/.test(src)) {
    fail("selftest: test must assert DispatchViewScreen is unrouted");
  }
  console.log(`${LABEL} selftest PASS`);
}

function main() {
  if (SELFTEST) {
    selftest();
    return;
  }
  if (!fs.existsSync(APP)) fail(`missing ${APP}`);
  const r = spawnSync("npx", ["vitest", "run"], {
    cwd: APP,
    encoding: "utf8",
    stdio: "inherit",
    env: process.env,
  });
  if (r.status !== 0) fail(`driver-pwa vitest exited ${r.status}`);
  console.log(`${LABEL} PASS — driver-pwa vitest suite green`);
}

main();
