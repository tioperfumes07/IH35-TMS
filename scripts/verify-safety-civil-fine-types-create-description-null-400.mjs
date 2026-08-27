#!/usr/bin/env node
// SAFETY-CIVIL-FINE-TYPES-CREATE-DESCRIPTION-NULL-400 — guard
//
// Live-confirmed against prod: POST /api/v1/catalogs/safety/civil-fine-types with description:null
// (CivilFineTypeModal.tsx's real blank-Description value, `form.description.trim() || null`) 400'd with
// fieldErrors.description: ["Invalid input: expected string, received null"]. createBodySchema's
// description field was a bare `.optional()`; the sibling updateBodySchema field 10 lines below already
// had `.nullable()`. Sibling of LISTS-LOAD-CANCELLATION-REASONS-CREATE-DESCRIPTION-NULL-400 (#16702) —
// same bug class, different catalog, found by auditing every frontend page using the
// `description: ... || null` idiom against its own backend schema.

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const ROUTES_FILE = "apps/backend/src/catalogs/safety/civil-fine-types.routes.ts";

export function check(text) {
  const failures = [];
  const idx = text.indexOf("export const createBodySchema = z.object({");
  const block = idx >= 0 ? text.slice(idx, idx + 900) : "";
  if (!/description: z\.string\(\)\.trim\(\)\.max\(500\)\.nullable\(\)\.optional\(\),/.test(block)) {
    failures.push(`${ROUTES_FILE} createBodySchema's description field no longer accepts null — a blank-Description create will 400 again`);
  }
  return failures;
}

function run() {
  const text = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const failures = check(text);
  if (failures.length > 0) {
    console.error("FAIL: safety-civil-fine-types-create-description-null-400");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("PASS: Civil Fine Types Create accepts a blank Description");
}

function selftest() {
  const text = fs.readFileSync(path.join(root, ROUTES_FILE), "utf8");
  const offender = text.replace(
    "description: z.string().trim().max(500).nullable().optional(),\n  metadata:",
    "description: z.string().trim().max(500).optional(),\n  metadata:"
  );
  if (offender === text) {
    console.error("FAIL(selftest): offender mutation did not change the file — pattern out of sync");
    process.exit(1);
  }
  const failures = check(offender);
  if (failures.length === 0) {
    console.error("FAIL(selftest): planted offender (schema reverted to non-nullable) was NOT caught");
    process.exit(1);
  }
  console.log("PASS(selftest): planted regression correctly caught; baseline clean");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  run();
}
