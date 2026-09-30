import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-truck-line-exhaust-fits-its-viewbox.mjs"], { stdio: "inherit" });
