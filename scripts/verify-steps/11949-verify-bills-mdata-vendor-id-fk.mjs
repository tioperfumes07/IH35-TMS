import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-bills-mdata-vendor-id-fk.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-bills-mdata-vendor-id-fk.mjs"], { stdio: "inherit" });
