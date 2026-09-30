import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-pm-schedule-never-guesses-a-baseline.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-pm-schedule-never-guesses-a-baseline.mjs"], { stdio: "inherit" });
