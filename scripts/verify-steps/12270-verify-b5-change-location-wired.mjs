import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-b5-change-location-wired.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-b5-change-location-wired.mjs"], { stdio: "inherit" });
