import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-settlement-legs-carry-lane-and-source.mjs"], { stdio: "inherit" });
