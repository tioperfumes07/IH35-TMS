#!/usr/bin/env node
// Claim step 18388 (CC-1 band mod4==0) — verify-driver-bill-due-date-projected-delivery.mjs
// Registered in PR that fixes verify-cc1-money-orphan-guard-registry-batch static red (E5).
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-driver-bill-due-date-projected-delivery.mjs"), "--selftest"], { stdio: "inherit" });
