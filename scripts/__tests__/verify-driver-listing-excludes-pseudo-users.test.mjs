#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptPath = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../verify-driver-listing-excludes-pseudo-users.mjs"
);
const result = spawnSync(process.execPath, [scriptPath], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);
