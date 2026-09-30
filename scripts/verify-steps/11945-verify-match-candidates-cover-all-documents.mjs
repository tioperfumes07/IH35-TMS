#!/usr/bin/env node
// verify-step 11838 -- wrapper. See scripts/verify-match-candidates-cover-all-documents.mjs.
// Replaces the retired settlement-born-only guard. Owner ruling 2026-09-30: the bank-match engine
// is for ALL transactions and documents; narrowing the candidate universe is the defect now.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-match-candidates-cover-all-documents.mjs")], { stdio: "inherit" });
