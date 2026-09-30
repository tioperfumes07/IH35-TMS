import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-arrival-stop-coordinate-source.mjs"], { stdio: "inherit" });
