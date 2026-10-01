import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-bank-tieout-live.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-bank-tieout-live.mjs"], { stdio: "inherit" });
