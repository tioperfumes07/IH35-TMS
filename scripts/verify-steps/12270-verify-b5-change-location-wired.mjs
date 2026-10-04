import { execFileSync } from "node:child_process";
// BANK-F91431 — ORDERS §B-5 full reclassify/batch chrome (period balances + Account no. + batch strip)
// rides the same wired step as Change location so CI runs the ops pack after F91430 restored it.
execFileSync(process.execPath, ["scripts/ops/verify-b5-reclassify-batch.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/ops/verify-b5-reclassify-batch.mjs"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-b5-change-location-wired.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-b5-change-location-wired.mjs"], { stdio: "inherit" });
