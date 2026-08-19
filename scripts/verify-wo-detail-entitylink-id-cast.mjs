#!/usr/bin/env node
/**
 * PR #10168 (MAINT-WO-TRAILER-REVERSE) added an `EntityLinkOrTombstone` id prop sourced from
 * `wo.equipment_id` without the `as string | null` cast every other `wo.<field>` id prop in this
 * file uses. `wo` is typed `Record<string, unknown>` (WorkOrderDetailPage.tsx's `getWorkOrder`
 * returns `apiRequest<Record<string, unknown>>`), so an uncast `wo.<field>` id prop is a real
 * `tsc -b` break (TS2322), not a style nit — it broke `apps/frontend`'s composite build for every
 * seat. This guard locks the cast on every `EntityLinkOrTombstone ... id={wo.<field>` occurrence in
 * this file so a future addition can't reintroduce the same class of break.
 */
import fs from "node:fs";

const FILE = "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx";

function failures(source) {
  const out = [];
  const re = /<EntityLinkOrTombstone\b[^>]*\bid=\{wo\.(\w+)([^}]*)\}/g;
  let m;
  while ((m = re.exec(source))) {
    const [full, field, rest] = m;
    if (!/\bas\s+string\s*\|\s*null\b/.test(rest)) {
      out.push(`wo.${field} id prop is missing the "as string | null" cast (${full.trim()})`);
    }
  }
  if (out.length === 0 && !/<EntityLinkOrTombstone\b/.test(source)) {
    out.push("no EntityLinkOrTombstone usage found — file shape changed, re-check this guard's anchor");
  }
  return out;
}

const live = fs.readFileSync(FILE, "utf8");

if (process.argv.includes("--selftest") || process.argv.includes("--self-test")) {
  const mutant = live.replace(
    'id={wo.equipment_id as string | null} name={wo.equipment_number} noun="Trailer"',
    'id={wo.equipment_id} name={wo.equipment_number} noun="Trailer"',
  );
  if (mutant === live) {
    console.error("verify-wo-detail-entitylink-id-cast SELFTEST FAIL — mutation anchor missing");
    process.exit(1);
  }
  if (failures(mutant).length === 0) {
    console.error("verify-wo-detail-entitylink-id-cast SELFTEST FAIL — planted defect escaped");
    process.exit(1);
  }
  console.log("verify-wo-detail-entitylink-id-cast SELFTEST PASS — 1/1 planted defect rejected");
  process.exit(0);
}

const missing = failures(live);
if (missing.length) {
  console.error(`verify-wo-detail-entitylink-id-cast FAIL\n${missing.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log("verify-wo-detail-entitylink-id-cast PASS — every EntityLinkOrTombstone id sourced from wo.<field> casts as string | null");
