#!/usr/bin/env node
// verify-step 11835 -- wrapper. See scripts/verify-company-settlement-has-pdf.mjs.
// Owner 2026-09-30: "we need to get done also the company settlements pdfs not just driver."
// It was missing entirely -- .html was the only render route.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-company-settlement-has-pdf.mjs")], { stdio: "inherit" });
