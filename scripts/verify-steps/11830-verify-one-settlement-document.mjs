#!/usr/bin/env node
// verify-step 11830 -- wrapper. See scripts/verify-one-settlement-document.mjs.
// The driver settlement PDF and the on-screen statement must be the SAME document.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-one-settlement-document.mjs")], { stdio: "inherit" });
