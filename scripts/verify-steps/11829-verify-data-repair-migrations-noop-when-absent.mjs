#!/usr/bin/env node
// verify-step 11829 -- wrapper. See scripts/verify-data-repair-migrations-noop-when-absent.mjs.
// Third fresh-DB blocker of 2026-09-30: a data-repair migration RAISEd on a production-only company
// that no migration creates, killing the chain on every database built from source.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-data-repair-migrations-noop-when-absent.mjs")], { stdio: "inherit" });
