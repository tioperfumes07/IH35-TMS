import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-load-real-driven-miles.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-load-real-driven-miles.mjs"], { stdio: "inherit" });
