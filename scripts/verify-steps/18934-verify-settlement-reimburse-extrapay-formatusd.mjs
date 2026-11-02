// 18934 — verify-settlement-reimburse-extrapay-formatusd (claimed_by cursor)
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-settlement-reimburse-extrapay-formatusd.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-settlement-reimburse-extrapay-formatusd.mjs"], { stdio: "inherit" });
