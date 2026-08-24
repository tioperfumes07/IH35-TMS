#!/usr/bin/env node
import { spawnSync } from "node:child_process";

for (const args of [[], ["--selftest"]]) {
  const result = spawnSync(process.execPath, ["scripts/verify-insurance-creator.mjs", ...args], { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}
