import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-no-insurance-lawsuit-refs.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-no-insurance-lawsuit-refs.mjs"], { stdio: "inherit" });
