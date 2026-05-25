#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const defaultCommand = "node scripts/db-verify-critical-runtime.mjs --verify-content";
const command = process.env.VERIFY_CONTENT_DRIFT_CHECK_COMMAND || defaultCommand;

const run = spawnSync("sh", ["-lc", command], {
  encoding: "utf8",
  env: process.env,
});

const stdout = run.stdout ?? "";
const stderr = run.stderr ?? "";
const merged = `${stdout}\n${stderr}`;
const driftLines = merged
  .split(/\r?\n/)
  .map((line) => line.trim())
  .filter((line) => line.startsWith("DRIFT:"));

if (driftLines.length > 0) {
  console.error("verify:content-drift-check FAILED");
  for (const line of driftLines) {
    console.error(`- ${line}`);
  }
  process.exit(1);
}

if (run.status !== 0) {
  console.error("verify:content-drift-check FAILED");
  if (stderr.trim()) {
    console.error(stderr.trim());
  } else if (stdout.trim()) {
    console.error(stdout.trim());
  }
  process.exit(run.status ?? 1);
}

console.log("verify:content-drift-check OK");
