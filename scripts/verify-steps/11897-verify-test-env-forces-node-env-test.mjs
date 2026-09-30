import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-test-env-forces-node-env-test.mjs"], { stdio: "inherit" });
