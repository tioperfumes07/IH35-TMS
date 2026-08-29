#!/usr/bin/env node
/**
 * WAVE-B dispatch connectivity remainder — hops, queues, docs, settings mounts + drills.
 *
 * @matrix-built {"modules":["dispatch"],"cols":["connectivity"],"leafRe":"^(secondary\\.(settlements|pre_settlements)$|queues\\.(border|alerts|live_map|map|trip_pairing|factoring|factoring_queue)$|planning\\.(templates|unassigned)$|docs\\.(pod|ocr|equipment_transfers)$|settings\\.(dispatch|notify)$|misc\\.(geofence_history|chat|layover)$|load\\.detail$)","task":"WAVE-B-dispatch-connectivity-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-wave-b-dispatch-connectivity-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wave-b-dispatch-connectivity-remainder";
const MANIFEST = "apps/frontend/src/routes/manifest.tsx";

const CHECKS = [
  { name: "settlements hop → driver-finance", file: MANIFEST, pattern: /PreserveSearchNavigate to="\/driver-finance\/settlements"/ },
  { name: "dispatch settlements secondary mount", file: MANIFEST, pattern: /path="\/dispatch\/settlements"[\s\S]*subTab="settlements"/ },
  { name: "dispatch pre-settlements secondary mount", file: MANIFEST, pattern: /path="\/dispatch\/pre-settlements"[\s\S]*subTab="pre_settlements"/ },
  { name: "border crossing wizard route", file: MANIFEST, pattern: /path="\/dispatch\/border-crossing"/ },
  { name: "dispatch alerts route", file: MANIFEST, pattern: /path="\/dispatch\/alerts"/ },
  { name: "live map / geofencing route", file: MANIFEST, pattern: /path="\/dispatch\/geofencing"/ },
  { name: "map view route", file: MANIFEST, pattern: /path="\/dispatch\/map"/ },
  { name: "trip pairing route", file: MANIFEST, pattern: /path="\/dispatch\/trip-pairing"/ },
  { name: "factoring queue route", file: MANIFEST, pattern: /path="\/dispatch\/factoring-queue"/ },
  { name: "POD review route", file: MANIFEST, pattern: /path="\/dispatch\/pod-review"/ },
  { name: "OCR queue route", file: MANIFEST, pattern: /path="\/dispatch\/ocr-queue"/ },
  { name: "equipment transfers route", file: MANIFEST, pattern: /path="\/dispatch\/equipment-transfers"/ },
  { name: "notify preferences route", file: MANIFEST, pattern: /path="\/dispatch\/notify-preferences"/ },
  { name: "geofence history route", file: MANIFEST, pattern: /path="\/dispatch\/borders\/geofence-history"/ },
  { name: "dispatch chat route", file: MANIFEST, pattern: /path="\/dispatch\/chat"/ },
  { name: "driver layover route", file: MANIFEST, pattern: /path="\/dispatch\/layovers\/driver\/:driverId"/ },
  { name: "factoring queue EntityLink drills", file: "apps/frontend/src/pages/dispatch/FactoringQueuePage.tsx", pattern: /EntityLink/ },
  { name: "trip pairing EntityLink drills", file: "apps/frontend/src/pages/dispatch/TripPairingBoardPage.tsx", pattern: /EntityLink/ },
  { name: "POD review EntityLink drills", file: "apps/frontend/src/pages/dispatch/PodReviewPage.tsx", pattern: /EntityLink/ },
  { name: "equipment transfer EntityLink drills", file: "apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", pattern: /EntityLink/ },
  { name: "notify preferences EntityLink drills", file: "apps/frontend/src/pages/dispatch/NotifyPreferencesPage.tsx", pattern: /EntityLink/ },
  { name: "dispatch settings page exists", file: "apps/frontend/src/pages/dispatch/DispatchSettingsPage.tsx", pattern: /export function DispatchSettingsPage|function DispatchSettingsPage/ },
  { name: "load template library exists", file: "apps/frontend/src/pages/dispatch/LoadTemplateLibrary.tsx", pattern: /export function LoadTemplateLibrary|function LoadTemplateLibrary/ },
  { name: "dispatch sheet resolves canonical stop location label", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /loc\.location_name[\s\S]{0,180}LEFT JOIN mdata\.locations loc[\s\S]{0,180}loc\.operating_company_id = \$2::uuid/ },
  { name: "dispatch sheet stops inherit the already company-scoped parent load id", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /FROM mdata\.load_stops s[\s\S]{0,360}WHERE s\.load_id = \$1/ },
  { name: "dispatch sheet excludes voided soft-deleted stops", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /FROM mdata\.load_stops s[\s\S]{0,420}s\.soft_deleted_at IS NULL[\s\S]{0,100}ORDER BY s\.sequence_number ASC/ },
  { name: "dispatch sheet primary driver accepts an active company authorization", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /driver_company_authorizations dispatch_sheet_primary_dca[\s\S]{0,320}dispatch_sheet_primary_dca\.company_id = l\.operating_company_id[\s\S]{0,180}dispatch_sheet_primary_dca\.is_authorized = true[\s\S]{0,180}dispatch_sheet_primary_dca\.deactivated_at IS NULL/ },
  { name: "dispatch sheet retains archived customer without dropping the load", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /COALESCE\([\s\S]{0,100}?c\.customer_name,[\s\S]{0,160}?resolve_customer_label_same_company\(l\.customer_id, l\.operating_company_id\)[\s\S]{0,80}?AS customer_name[\s\S]{0,1800}?LEFT JOIN mdata\.customers c/ },
  { name: "dispatch sheet retains archived assigned-driver label", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /COALESCE\([\s\S]{0,160}?CONCAT_WS\(' ', d\.first_name, d\.last_name\)[\s\S]{0,180}?resolve_driver_label_same_company\(l\.assigned_primary_driver_id, l\.operating_company_id\)[\s\S]{0,80}?AS driver_name/ },
  { name: "dispatch sheet secondary driver accepts an active company authorization", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /driver_company_authorizations dispatch_sheet_secondary_dca[\s\S]{0,320}dispatch_sheet_secondary_dca\.company_id = \$2::uuid[\s\S]{0,180}dispatch_sheet_secondary_dca\.is_authorized = true[\s\S]{0,180}dispatch_sheet_secondary_dca\.deactivated_at IS NULL/ },
  { name: "dispatch sheet resolves the latest same-company trailer assignment", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /dispatch\.load_assignment_history dispatch_sheet_trailer_history[\s\S]{0,700}dispatch_sheet_trailer_history\.load_id = l\.id[\s\S]{0,180}dispatch_sheet_trailer_history\.operating_company_id = l\.operating_company_id[\s\S]{0,180}dispatch_sheet_trailer_history\.new_trailer_id IS NOT NULL[\s\S]{0,220}assigned_at DESC,[\s\S]{0,100}created_at DESC/ },
  { name: "dispatch sheet trailer lookup enforces active company ownership or lease", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /eq\.id = dispatch_sheet_trailer_history\.new_trailer_id[\s\S]{0,260}eq\.owner_company_id = l\.operating_company_id OR eq\.currently_leased_to_company_id = l\.operating_company_id[\s\S]{0,120}eq\.deactivated_at IS NULL/ },
  { name: "dispatch sheet model prints the resolved human trailer identity", file: "apps/backend/src/dispatch/dispatch-sheet.routes.ts", pattern: /trailerUnit: load\.trailer_number \? String\(load\.trailer_number\) : "—"[\s\S]{0,140}trailerSub: load\.trailer_equipment_type \? String\(load\.trailer_equipment_type\) : "No trailer assigned"/ },
];

function checkAll(readFile) {
  const failures = [];
  for (const c of CHECKS) {
    const src = readFile(c.file);
    if (src == null) {
      failures.push(`${c.name}: missing ${c.file}`);
      continue;
    }
    if (!c.pattern.test(src)) failures.push(`${c.name}: shape missing in ${c.file}`);
  }
  return failures;
}

if (process.argv.includes("--selftest")) {
  const fail = checkAll(() => "POISON");
  if (!fail.length) {
    console.error(`${LABEL} --selftest FAIL`);
    process.exit(1);
  }
  const routeFile = "apps/backend/src/dispatch/dispatch-sheet.routes.ts";
  const route = fs.readFileSync(path.join(ROOT, routeFile), "utf8");
  const mutations = [
    ["drops stop-to-parent-load scope", "WHERE s.load_id = $1", "WHERE true"],
    ["prints soft-deleted stop", "AND s.soft_deleted_at IS NULL", ""],
    ["drops trailer company scope", "AND dispatch_sheet_trailer_history.operating_company_id = l.operating_company_id", ""],
    ["accepts deactivated trailer", "AND eq.deactivated_at IS NULL", ""],
    ["hard-codes trailer label", "trailerUnit: load.trailer_number ? String(load.trailer_number) : \"—\"", "trailerUnit: \"—\""],
    ["drops archived customer resolver", "mdata.resolve_customer_label_same_company(l.customer_id, l.operating_company_id)", "NULL"],
    ["drops archived driver resolver", "mdata.resolve_driver_label_same_company(l.assigned_primary_driver_id, l.operating_company_id)", "NULL"],
  ];
  for (const [name, needle, replacement] of mutations) {
    const planted = route.replace(needle, replacement);
    if (planted === route) {
      console.error(`${LABEL} --selftest FAIL — mutation \"${name}\" changed nothing`);
      process.exit(1);
    }
    const errors = checkAll((rel) => rel === routeFile ? planted : fs.readFileSync(path.join(ROOT, rel), "utf8"));
    if (!errors.length) {
      console.error(`${LABEL} --selftest FAIL — mutation \"${name}\" was not detected`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS (poison trips ${fail.length}; ${mutations.length} dispatch-sheet mutations detected)`);
  process.exit(0);
}

const failures = checkAll((rel) => {
  const abs = path.join(ROOT, rel);
  return fs.existsSync(abs) ? fs.readFileSync(abs, "utf8") : null;
});
if (failures.length) {
  console.error(`${LABEL} FAIL:\n${failures.map((f) => ` - ${f}`).join("\n")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — dispatch connectivity remainder routes + drills ratcheted`);
