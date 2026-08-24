#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const guards = [
  "scripts/verify-maintenance-active-work-orders-failure-truth.mjs",
  "scripts/verify-maintenance-integration-strip-failure-truth.mjs",
  "scripts/verify-maintenance-wo-authorizer-read-failure-truth.mjs",
  "scripts/verify-maintenance-wo-identity-read-failure-truth.mjs",
];

for (const guard of guards) {
  const result = spawnSync(process.execPath, [guard, ...process.argv.slice(2)], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
