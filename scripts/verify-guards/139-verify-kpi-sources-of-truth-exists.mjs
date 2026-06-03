#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const res = spawnSync("node", ["scripts/verify-kpi-sources-of-truth-exists.mjs"], { cwd: root, stdio: "inherit" });
process.exit(res.status ?? 1);
