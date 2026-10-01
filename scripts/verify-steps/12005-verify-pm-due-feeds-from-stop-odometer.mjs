import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-pm-due-feeds-from-stop-odometer.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-pm-due-feeds-from-stop-odometer.mjs"], { stdio: "inherit" });
