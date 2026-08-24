#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(process.execPath, ["scripts/verify-users-returning-check-fails-closed.mjs", ...process.argv.slice(2)], {
  cwd: process.cwd(),
  stdio: "inherit",
});

process.exit(result.status ?? 1);
