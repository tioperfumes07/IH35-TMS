import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-new-units-have-gps-or-deactivation-reason.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-new-units-have-gps-or-deactivation-reason.mjs"], { stdio: "inherit" });
