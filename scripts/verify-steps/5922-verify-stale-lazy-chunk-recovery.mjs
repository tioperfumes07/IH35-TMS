#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const result = spawnSync(
  process.execPath,
  ["scripts/verify-stale-lazy-chunk-recovery.mjs", ...process.argv.slice(2)],
  { cwd: process.cwd(), stdio: "inherit" },
);

process.exit(result.status ?? 1);
