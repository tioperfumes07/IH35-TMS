import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-stop-dwell-boundary.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-stop-dwell-boundary.mjs"], { stdio: "inherit" });
