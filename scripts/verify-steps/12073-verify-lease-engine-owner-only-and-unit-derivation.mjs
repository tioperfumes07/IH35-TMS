import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-lease-engine-owner-only-and-unit-derivation.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-lease-engine-owner-only-and-unit-derivation.mjs"], { stdio: "inherit" });
