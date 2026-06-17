#!/usr/bin/env node
/**
 * verify-booking-driver-names.mjs (DRIVER-NAMES-IN-BOOKING)
 * The Book Load driver dropdown must compose names from first_name/last_name (mdata.drivers
 * has no full_name), or it falls back to "Driver N". Guards against regression.
 */
import fs from "node:fs";
import path from "node:path";
const src = fs.readFileSync(path.join(process.cwd(), "apps/frontend/src/pages/dispatch/components/BookLoadEquipmentSection.tsx"), "utf8");
if (!/toDriverOption[\s\S]{0,400}first_name[\s\S]{0,120}last_name/.test(src)) {
  console.error("verify-booking-driver-names FAIL: toDriverOption must compose the label from first_name + last_name.");
  process.exit(1);
}
console.log("verify-booking-driver-names OK — booking driver dropdown uses real first/last names.");
