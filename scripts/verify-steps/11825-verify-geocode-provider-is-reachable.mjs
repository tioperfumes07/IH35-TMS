#!/usr/bin/env node
// verify-step 11825 -- wrapper, see scripts/verify-geocode-provider-is-reachable.mjs for the real
// check. T-08 (Lead, 2026-09-30): this guard was already written and already caught a real
// production regression (ROUND 168's "THE BREAK IS GEOCODING" incident) but was never wired into
// a claimed verify-step, so verify-guard-wired.mjs flagged it as an orphan -- present, correct,
// but not enforced by CI.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-geocode-provider-is-reachable.mjs")], { stdio: "inherit" });
