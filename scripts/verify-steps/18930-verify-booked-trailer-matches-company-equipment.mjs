// 18930 — verify-booked-trailer-matches-company-equipment (ENG-22 prevention; claimed_by cursor)
import { execFileSync } from "node:child_process";
execFileSync(process.execPath, ["scripts/verify-booked-trailer-matches-company-equipment.mjs", "--selftest"], { stdio: "inherit" });
execFileSync(process.execPath, ["scripts/verify-booked-trailer-matches-company-equipment.mjs"], { stdio: "inherit" });
