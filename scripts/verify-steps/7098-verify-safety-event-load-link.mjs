#!/usr/bin/env node
import { spawnSync } from "node:child_process";

for (const args of [[], ["--selftest"]]) {
  const result = spawnSync(process.execPath, ["scripts/verify-safety-event-load-link.mjs", ...args], {
    cwd: process.cwd(),
    stdio: "inherit",
  });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
