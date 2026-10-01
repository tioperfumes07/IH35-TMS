import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-no-frozen-entity-unit-on-usmca.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-no-frozen-entity-unit-on-usmca.mjs"], { stdio: "inherit" });
