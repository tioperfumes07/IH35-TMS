#!/usr/bin/env node
// verify-step 11834 -- wrapper. See scripts/verify-truck-line-location-header-over-its-column.mjs.
// Owner-live 2026-09-30: "change the location header to the correct column, it was next to transit."
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-truck-line-location-header-over-its-column.mjs")], { stdio: "inherit" });
