import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-legal-contract-linkage.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-legal-contract-linkage.mjs"], { stdio: "inherit" });
