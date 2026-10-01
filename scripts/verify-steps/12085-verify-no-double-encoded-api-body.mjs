import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-no-double-encoded-api-body.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-no-double-encoded-api-body.mjs"], { stdio: "inherit" });
