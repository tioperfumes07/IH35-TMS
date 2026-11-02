import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-loads-trailer-source-recorded.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-loads-trailer-source-recorded.mjs"], { stdio: "inherit" });
