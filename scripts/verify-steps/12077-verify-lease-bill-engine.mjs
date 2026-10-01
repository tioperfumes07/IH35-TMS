import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-lease-bill-engine.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-lease-bill-engine.mjs"], { stdio: "inherit" });
