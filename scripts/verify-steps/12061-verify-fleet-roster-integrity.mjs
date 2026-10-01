import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-fleet-roster-integrity.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-fleet-roster-integrity.mjs"], { stdio: "inherit" });
