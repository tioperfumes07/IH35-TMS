#!/usr/bin/env node
// Claim step 18400 (CC-1 band mod4==0) — verify-driver-ap-not-in-vendor-row.mjs
// 443.274-A: driver-category AP bills must emit document_kind=driver_bill, not bill
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync(process.execPath, [path.join(ROOT, "scripts/verify-driver-ap-not-in-vendor-row.mjs"), "--selftest"], { stdio: "inherit" });
