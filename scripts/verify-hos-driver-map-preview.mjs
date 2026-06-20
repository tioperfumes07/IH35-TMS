#!/usr/bin/env node
/**
 * HOS-MAP guard: the driver↔Samsara-id preview is READ/PREVIEW ONLY.
 * A wrong samsara_driver_id attributes one driver's HOS clocks to another (an FMCSA error), and a mass write
 * to driver records is Jorge-gated — so this block must NEVER write. Fails CI if the preview service/route
 * contains any INSERT/UPDATE/DELETE against mdata.drivers (or any mutation at all).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const failures = [];
const read = (p) => {
  const abs = path.join(ROOT, p);
  if (!fs.existsSync(abs)) { failures.push(`MISSING: ${p}`); return ""; }
  return fs.readFileSync(abs, "utf8");
};

const SVC = "apps/backend/src/integrations/samsara/hos-driver-map-preview.service.ts";
const ROUTE = "apps/backend/src/integrations/samsara/hos-driver-map-preview.routes.ts";

const svc = read(SVC);
const route = read(ROUTE);

// Strip comments first so documentation that *mentions* the gated write (e.g. "the UPDATE … is separate")
// doesn't trip the mutation check — we only care about real code.
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "").replace(/([^:])\/\/.*$/gm, "$1");
for (const [file, src] of [[SVC, svc], [ROUTE, route]]) {
  if (!src) continue;
  const code = stripComments(src);
  // No data mutation anywhere in this block — preview only.
  if (/\b(INSERT\s+INTO|UPDATE\s+mdata\.drivers|UPDATE\s+"?\w|DELETE\s+FROM)\b/i.test(code)) {
    failures.push(`${file}: contains a data mutation — HOS-MAP preview must be READ-ONLY (the write is Jorge-gated, separate).`);
  }
  if (/SET\s+samsara_driver_id/i.test(code)) {
    failures.push(`${file}: stamps samsara_driver_id — that write is a separate Jorge-approved step, not this block.`);
  }
}

// Positive checks: the matcher exists and matches by stable identifier, not name-only.
if (svc) {
  if (!/previewDriverSamsaraMap/.test(svc)) failures.push(`${SVC}: must export previewDriverSamsaraMap`);
  if (!/normLicense|byLicense/.test(svc)) failures.push(`${SVC}: must match by license (stable id), not name alone`);
  if (!/normPhone|byPhone/.test(svc)) failures.push(`${SVC}: must match by phone (stable id), not name alone`);
  if (!/confidence/.test(svc) || !/ambiguous/.test(svc)) failures.push(`${SVC}: must report confidence + ambiguous candidates (never silently resolve)`);
}
if (route) {
  if (!/\.get\(/.test(route) || /\.(post|put|patch|delete)\(/i.test(route)) {
    failures.push(`${ROUTE}: must expose a GET preview only — no write verb endpoint.`);
  }
}

if (failures.length) {
  console.error("verify:hos-driver-map-preview FAIL:");
  for (const f of failures) console.error(" - " + f);
  process.exit(1);
}
console.log("verify:hos-driver-map-preview OK");
