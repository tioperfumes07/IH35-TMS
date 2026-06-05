#!/usr/bin/env node
import { spawnSync } from "node:child_process";

const scripts = [
  "scripts/edge-breakpoint-walk-320.mjs",
  "scripts/edge-breakpoint-walk-1920.mjs",
  "scripts/edge-breakpoint-walk-2560.mjs",
];

for (const script of scripts) {
  const result = spawnSync(`node ${script}`, {
    shell: true,
    stdio: "inherit",
  });
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}

console.log("[verify-no-overflow-at-edge-breakpoints] OK");
