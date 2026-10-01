import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-pm-cost-per-mile-real-driven.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-pm-cost-per-mile-real-driven.mjs"], { stdio: "inherit" });
