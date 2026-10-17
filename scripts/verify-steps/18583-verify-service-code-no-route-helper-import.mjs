#!/usr/bin/env node
/**
 * LEAD 443.191 (ruling 08:55Z, CC-2) — service code takes the company scope from accounting/db-scope.ts, never the HTTP
 * route-helper module accounting/shared.ts (whose import graph reaches auth/session-middleware -> lucia and killed 15
 * backend test files at import). verify:pre-commit auto-runs this step: it runs the guard and its --selftest.
 *
 * --selftest: a planted missing guard path must fail the step.
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const GUARD = "scripts/verify-service-code-no-route-helper-import.mjs";

function run(guard) {
  if (!existsSync(resolve(ROOT, guard))) return [`${guard}: missing`];
  const failures = [];
  for (const args of [[], ["--selftest"]]) {
    const r = spawnSync(process.execPath, [resolve(ROOT, guard), ...args], { cwd: ROOT, encoding: "utf8" });
    if (r.status !== 0) failures.push(`${guard}${args.length ? " --selftest" : ""}: exit ${r.status} — ${(r.stderr || r.stdout).trim().split("\n").slice(-3).join(" | ")}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const planted = run("scripts/__planted-missing-guard__.mjs");
  const ok = planted.length === 1 && /missing/.test(planted[0]);
  console.log(`18583 --selftest ${ok ? "PASS" : "FAIL"} — planted missing guard ${ok ? "fails the step" : "was NOT caught"}`);
  process.exit(ok ? 0 : 1);
}

const failures = run(GUARD);
if (failures.length) {
  console.error(`18583 FAIL:\n${failures.map((f) => `  ✗ ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("18583 PASS — verify-service-code-no-route-helper-import + --selftest");
