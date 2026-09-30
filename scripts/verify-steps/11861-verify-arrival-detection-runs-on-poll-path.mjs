#!/usr/bin/env node
// verify-step 11839 -- wrapper. See scripts/verify-arrival-detection-runs-on-poll-path.mjs.
// T-01: arrival detection had ONE caller, the Samsara webhook projector, and this account has
// never delivered a webhook. dispatch.stop_arrivals sat at 0 rows for the engine's entire life.
import { fileURLToPath } from "node:url";
import path from "node:path";
import { execFileSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
execFileSync("node", [path.join(ROOT, "scripts/verify-arrival-detection-runs-on-poll-path.mjs")], { stdio: "inherit" });
