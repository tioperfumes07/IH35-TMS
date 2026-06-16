#!/usr/bin/env node
/**
 * verify-booking-unit-ownership-fallback.mjs (bug #G — booking invalid_unit_for_company)
 * The Book Load unit check must NOT hard-reject a unit solely because it lacks an
 * insurance asset-registry row (mdata.assets). When coverage.asset_exists is false it
 * must fall back to the operational ownership criteria (mdata.units owner/leased company)
 * before returning invalid_unit_for_company — otherwise real company trucks shown in the
 * dropdown can't be booked.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const src = fs.readFileSync(path.join(ROOT, "apps/backend/src/dispatch/book-load.service.ts"), "utf8");

const errors = [];
if (!/!coverage\.asset_exists/.test(src)) {
  errors.push("book-load.service.ts: missing the coverage.asset_exists branch.");
}
// The fallback must query mdata.units by owner/leased company inside the asset_exists branch.
if (!/FROM mdata\.units[\s\S]*owner_company_id[\s\S]*currently_leased_to_company_id/.test(src)) {
  errors.push("book-load.service.ts: invalid_unit_for_company must fall back to mdata.units owner/leased ownership (dropdown parity).");
}

if (errors.length > 0) {
  console.error("verify-booking-unit-ownership-fallback FAIL:");
  for (const e of errors) console.error(`  • ${e}`);
  process.exit(1);
}
console.log("verify-booking-unit-ownership-fallback OK — unit existence falls back to mdata.units ownership before 400.");
