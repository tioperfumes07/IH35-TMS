import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-relocated-canonical-declarations-are-bound.mjs"], { stdio: "inherit" });
