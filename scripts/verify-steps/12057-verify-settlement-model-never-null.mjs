import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-settlement-model-never-null.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-settlement-model-never-null.mjs"], { stdio: "inherit" });
