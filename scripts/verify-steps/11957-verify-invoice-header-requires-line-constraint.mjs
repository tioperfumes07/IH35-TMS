import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-invoice-header-requires-line-constraint.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-invoice-header-requires-line-constraint.mjs"], { stdio: "inherit" });
