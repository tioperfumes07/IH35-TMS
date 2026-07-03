#!/usr/bin/env node
/**
 * SC2 guard — the safety damage-report creator must stay a full wizard wired to the finished
 * safety.incidents API, not regress to the location+description-only stub it shipped as.
 *
 * Asserts the creator:
 *  1. imports the company-scoped listDrivers + listUnits pickers,
 *  2. posts driver_id / unit_id / incident_at / damage_amount_cents (the McLeod/Alvys damage keys),
 *  3. passes limit:200 to the driver picker (default-50 silently drops active drivers),
 *  4. converts dollars->cents via MoneyInput cents mode (damage_amount_cents is integer cents),
 *  5. surfaces a photo-upload step after create,
 *  6. uses "+ Create" vocab (never "+ New" / "+ Add").
 *
 * A negative test in scripts/__tests__ / manual: pointing this at the old stub
 * (SafetyIncidentsClusterSurface's inline creator, which sent only location+description) fails
 * because none of listDrivers/unit_id/damage_amount_cents are present there.
 */
import { readFileSync, existsSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");

const CREATOR_PATH = resolve(
  ROOT,
  "apps/frontend/src/pages/safety/components/DamageReportCreatorModal.tsx"
);
const SURFACE_PATH = resolve(
  ROOT,
  "apps/frontend/src/pages/safety/components/DamageReportsSurface.tsx"
);

const failures = [];

function checkFile(label, path, checks) {
  if (!existsSync(path)) {
    failures.push(`${label}: file not found at ${path}`);
    return;
  }
  const src = readFileSync(path, "utf8");
  for (const [desc, pattern] of checks) {
    const re = typeof pattern === "string" ? new RegExp(pattern) : pattern;
    if (!re.test(src)) failures.push(`${label}: missing ${desc} (pattern: ${pattern})`);
  }
}

checkFile("DamageReportCreatorModal", CREATOR_PATH, [
  ["imports listDrivers", /import\s*\{[^}]*\blistDrivers\b[^}]*\}\s*from\s*["'][^"']*\/api\/mdata["']/],
  ["imports listUnits", /import\s*\{[^}]*\blistUnits\b[^}]*\}\s*from\s*["'][^"']*\/api\/mdata["']/],
  ["posts incident_at", /incident_at:/],
  ["posts driver_id", /driver_id:/],
  ["posts unit_id", /unit_id:/],
  ["posts load_id", /load_id:/],
  ["posts damage_amount_cents", /damage_amount_cents:/],
  ["driver picker passes limit:200", /listDrivers\([^)]*limit:\s*200/s],
  ["unit picker passes limit:200", /listUnits\([^)]*limit:\s*200/s],
  ["operating_company_id required on driver picker", /listDrivers\([^)]*operating_company_id/s],
  ["MoneyInput cents mode for damage amount", /onChangeCents=\{setDamageCents\}/],
  ["photo-upload step after create", /uploadSafetyIncidentPhoto/],
  ["photo step wording", /add photos/i],
  ["+ Create vocab", /\+\s*Create damage report/],
]);

// Vocabulary guard: never "+ New" / "+ Add" in the damage creator or surface.
for (const p of [CREATOR_PATH, SURFACE_PATH]) {
  if (!existsSync(p)) continue;
  const src = readFileSync(p, "utf8");
  if (/\+\s*New\s+[A-Za-z]|\+\s*Add\s+[A-Za-z]/.test(src)) {
    failures.push(`Vocabulary violation: found '+ New' or '+ Add' in ${p}`);
  }
}

checkFile("DamageReportsSurface", SURFACE_PATH, [
  ["renders the full creator modal", /DamageReportCreatorModal/],
  ["+ Create damage report button", /\+\s*Create damage report/],
]);

if (failures.length > 0) {
  console.error("❌ damage-report-creator contract FAILED:");
  for (const f of failures) console.error("   " + f);
  process.exit(1);
}

console.log("✅ damage-report-creator contract passed");
