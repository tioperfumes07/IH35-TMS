#!/usr/bin/env node
// verify-step 11838 -- A-21: customers/vendors list endpoints share ONE has-transactions predicate.
// Static, no DATABASE_URL.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-has-transactions-predicate-shared.mjs"), "--selftest"], { stdio: "inherit" });
execFileSync("node", [path.join(ROOT, "scripts/verify-has-transactions-predicate-shared.mjs")], { stdio: "inherit" });
