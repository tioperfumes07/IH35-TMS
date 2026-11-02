// 18932 — verify-profitability-hub-wired (fill-not-shell Profitability; claimed_by cursor)
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-profitability-hub-wired.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-profitability-hub-wired.mjs"], { stdio: "inherit" });
