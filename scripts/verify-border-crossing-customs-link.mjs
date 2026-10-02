#!/usr/bin/env node
/**
 * E-29 addition: a detected border crossing links to the crossing the office declared (mdata.unit_border_crossings)
 * on a UNIQUE match only, and both sides read the other. Fails if the link step stops being unique-only, stops
 * running after the detector, or either reverse read disappears.
 */
import { readFileSync } from "node:fs";
const det = readFileSync("apps/backend/src/integrations/samsara/border-crossings/detector.service.ts", "utf8");
const link = readFileSync("apps/backend/src/telematics/telematics-linkage.service.ts", "utf8");
const hist = readFileSync("apps/backend/src/border-crossing/border-crossing-history.routes.ts", "utf8");
const mig = readFileSync("db/migrations/202615191100_border_crossing_events_customs_link.sql", "utf8");
const checks = [
  [/unit_border_crossing_id uuid NULL REFERENCES mdata\.unit_border_crossings\(id\)/.test(mig), "FK event -> declared customs record"],
  [/c\.n_for_event = 1 AND c\.n_for_declared = 1/.test(det) && /NOT EXISTS \(SELECT 1 FROM dispatch\.border_crossing_events x WHERE x\.unit_border_crossing_id = c\.declared_id\)/.test(det), "unique matches only, one event per declaration"],
  [/d\.direction = e\.direction/.test(det) && /<= 86400/.test(det), "same direction within 24 hours"],
  [/out\.linked_to_customs = await linkCrossingsToCustomsRecords\(client, operatingCompanyId\)/.test(det), "link step runs after every detector pass"],
  [/customs_record_id/.test(link) && /unit_ctpat_status/.test(link), "load reverse link shows the customs record + truck CTPAT"],
  [/detected_entered_at/.test(hist), "declaration (history) shows the detected crossing"],
];
const fails = checks.filter(([ok]) => !ok).map(([, w]) => w);
if (fails.length) { console.error("verify-border-crossing-customs-link: FAIL\n  " + fails.join("\n  ")); process.exit(1); }
console.log(`verify-border-crossing-customs-link: OK (${checks.length})`);
