import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-dispute-object-sets-never-share-a-query.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-dispute-object-sets-never-share-a-query.mjs"], { stdio: "inherit" });
