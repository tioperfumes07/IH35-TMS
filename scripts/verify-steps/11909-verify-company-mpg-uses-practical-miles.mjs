import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-company-mpg-uses-practical-miles.mjs"], { stdio: "inherit" });
