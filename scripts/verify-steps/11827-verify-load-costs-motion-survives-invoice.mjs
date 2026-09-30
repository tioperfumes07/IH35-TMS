#!/usr/bin/env node
// verify-step 11827 -- wrapper. See scripts/verify-load-costs-motion-survives-invoice.mjs.
// Owner-live 2026-09-30: Load Costs rendered 14 of the 16 loads the API returned, dropping
// 13625/13626 (status='dispatched', is_invoiced=true) because an accounting flag closed freight
// that was still on the road.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-load-costs-motion-survives-invoice.mjs")], { stdio: "inherit" });
