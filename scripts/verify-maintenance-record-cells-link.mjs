// GUARD (GLOBAL RULE): a maintenance ParityTable tab is NOT done until its record cells NAVIGATE.
// Assert each converted tab renders the expected record-cell anchors (<Link to=`/…/{id}`>) per
// 00-MASTER-LINK-MAP, so a recolor/refactor can never silently turn them back into plain text.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-maintenance-record-cells-link: ${m}`); process.exit(1); };

// file → required record-cell link route prefixes (only routes the data can actually resolve).
const REQUIRED = {
  "apps/frontend/src/pages/maintenance/RoadServiceList.tsx": [
    "/maintenance/work-orders/", "/fleet/", "/drivers/", "/vendors/",
  ],
  "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx": [
    "/maintenance/work-orders/", "/fleet/",
  ],
  "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx": [
    "/maintenance/work-orders/", "/fleet/", "/drivers/",
  ],
  "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx": [
    "/drivers/",
  ],
  // Master Data tabs (universal-list ParityTable). Parts is intentionally absent: parts are not a
  // linkable entity (no part-detail route), so that tab has no record-cell anchor — honest, no dead link.
  "apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx": [
    "/fleet/units/",
  ],
  "apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx": [
    "/drivers/",
  ],
  "apps/frontend/src/pages/maintenance/vendors/VendorsPage.tsx": [
    "/maintenance/vendors/",
  ],
  "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx": [
    "/fleet/units/", "/dispatch/loads/", "/drivers/",
  ],
  "apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx": [
    "/fleet/units/", "/drivers/",
  ],
  // Each new ParityTable tab must add itself here so its record-cell anchors are locked against regression.
};

const failures = [];
for (const [file, prefixes] of Object.entries(REQUIRED)) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { failures.push(`${file} (missing)`); continue; }
  if (!/<Link\s+to=/.test(src)) failures.push(`${file}: no <Link to=…> record cells at all`);
  for (const p of prefixes) {
    // match `to={`/prefix...` }` (template-literal link to a record detail/filtered route)
    const re = new RegExp("to=\\{`" + p.replace(/\//g, "\\/"));
    if (!re.test(src)) failures.push(`${file}: missing record-cell link to ${p}{id}`);
  }
}

if (failures.length) fail("record cells must be anchors (no plain-text record cells):\n  " + failures.join("\n  "));
console.log(`OK verify-maintenance-record-cells-link: ${Object.keys(REQUIRED).length} ParityTable tabs have navigating record cells.`);
