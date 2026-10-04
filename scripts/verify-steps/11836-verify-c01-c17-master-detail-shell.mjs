#!/usr/bin/env node
// verify-step 11836 -- wrapper. Cursor's C-01/C-02/C-03/C-16/C-17 master-detail shell guard.
// It was written, it PASSES today, and it was wired to nothing -- a guard nobody runs protects
// nothing. Static, no DATABASE_URL, safe on the local path. Measured PASS before wiring.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-c01-c17-master-detail-shell.mjs")], { stdio: "inherit" });
// BANK-F91442 — C-05 MINIMUM-SCROLL (viewport lock + master-detail fill). Never ran in CI.
execFileSync("node", [path.join(ROOT, "scripts/ops/verify-c05-minimum-scroll.mjs"), "--selftest"], { stdio: "inherit" });
