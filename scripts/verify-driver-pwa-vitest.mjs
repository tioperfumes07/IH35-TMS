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

function verifyDispatchViewTest(src) {
  const failures = [];
  if (!/\.toContain\(["']path="\/dispatch\/:load_uuid"["']\)/.test(src)) {
    failures.push("test must require the mounted DispatchViewScreen route");
  }
  if (!/\.toContain\(["']DispatchViewScreen["']\)/.test(src)) {
    failures.push("test must require DispatchViewScreen");
  }
  if (!/\.toContain\(["']StopActionPage["']\)/.test(src) || !/loads\/:id\/stops\/:stopId/.test(src)) {
    failures.push("test must lock StopActionPage route");
  }
  if (!/navigate\(`\/dispatch\/\$\{load\.id\}`\)/.test(src)) {
    failures.push("test must lock canonical load-detail navigation to DispatchViewScreen");
  }
  return failures;
}

function selftest() {
  const src = fs.readFileSync(path.join(ROOT, TEST), "utf8");
  const liveFailures = verifyDispatchViewTest(src);
  if (liveFailures.length) fail(`selftest: live contract is unclean: ${liveFailures.join("; ")}`);

  const mutations = [
    src.replace('path="/dispatch/:load_uuid"', 'path="/dispatch/REMOVED"'),
    src.replace('toContain("DispatchViewScreen")', 'toContain("RemovedDispatchView")'),
    src.replace('toContain("StopActionPage")', 'toContain("RemovedStopAction")'),
    src.replace('navigate(`/dispatch/${load.id}`)', 'navigate(`/loads/${load.id}`)'),
  ];
  mutations.forEach((mutation, index) => {
    if (mutation === src || verifyDispatchViewTest(mutation).length === 0) {
      fail(`selftest mutation escaped: ${index + 1}`);
    }
  });
  console.log(`${LABEL} selftest PASS (4/4)`);
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
