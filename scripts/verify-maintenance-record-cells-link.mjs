// GUARD (GLOBAL RULE): a maintenance ParityTable tab is NOT done until its record cells NAVIGATE.
// Assert each converted tab renders the expected record-cell anchors using either:
//   <Link to={`/…/{id}`}>  (react-router Link), or
//   <EntityLink kind="…">  (shared drill-through primitive — resolves routes internally)
// This ensures a refactor/recolor can never silently turn them back into plain text.
import { readFileSync } from "node:fs";

const fail = (m) => { console.error(`FAIL verify-maintenance-record-cells-link: ${m}`); process.exit(1); };

// Maps a route-prefix string to the EntityLink kind that resolves to an equivalent route.
// Used as an alternative acceptance criterion when code uses EntityLink instead of <Link to=`.
const PREFIX_TO_ENTITY_KIND = {
  "/maintenance/work-orders/": "work_order",
  "/fleet/": "unit",          // legacy wrong prefix — EntityLink kind="unit" → /fleet/units/:id (correct)
  "/fleet/units/": "unit",
  "/drivers/": "driver",
  "/dispatch/loads/": "load",
  "/customers/": "customer",
  "/vendors/": "vendor",
};

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
  // Fleet asset profile (/fleet/units/:id) record cells — driver + per-WO links (Block 3).
  "apps/frontend/src/components/vehicle-profile/DriverAssignmentSection.tsx": [
    "/drivers/",
  ],
  "apps/frontend/src/components/vehicle-profile/MaintenanceSnapshotSection.tsx": [
    "/maintenance/work-orders/",
  ],
  // Trailer asset profile (/fleet/trailers/:id) record cells (Block 3 item 5).
  "apps/frontend/src/components/trailer-profile/CurrentAssignmentSection.tsx": [
    "/fleet/units/", "/dispatch/loads/",
  ],
  "apps/frontend/src/components/trailer-profile/MaintenanceSnapshotSection.tsx": [
    "/maintenance/work-orders/",
  ],
  // Operational LIST tables — the primary record cell already navigates to its detail; locked here so a
  // refactor can't silently turn them back into plain text (regression-lock; the links pre-existed).
  "apps/frontend/src/pages/drivers/DriversTable.tsx": [
    "/drivers/",
  ],
  "apps/frontend/src/pages/customers/CustomersListView.tsx": [
    "/customers/",
  ],
  "apps/frontend/src/pages/vendors/VendorsListView.tsx": [
    "/vendors/",
  ],
  // Each new ParityTable tab must add itself here so its record-cell anchors are locked against regression.
};

const failures = [];
const maintenanceDrivers = readFileSync("apps/frontend/src/pages/maintenance/drivers/DriversMasterDataPage.tsx", "utf8");
if (!/driversQuery\.isError[\s\S]*?<ListErrorState[\s\S]*?driversQuery\.refetch\(\)/.test(maintenanceDrivers)) {
  failures.push("DriversMasterDataPage: list failures must render a retryable ListErrorState before the empty table");
}
const maintenanceVehicles = readFileSync("apps/frontend/src/pages/maintenance/vehicles/VehiclesMasterDataPage.tsx", "utf8");
if (!/vehiclesQuery\.isError[\s\S]*?<ListErrorState[\s\S]*?vehiclesQuery\.refetch\(\)/.test(maintenanceVehicles)) {
  failures.push("VehiclesMasterDataPage: list failures must render a retryable ListErrorState before the empty table");
}
const workOrderDetail = readFileSync("apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", "utf8");
if (workOrderDetail.includes("selectedAssetId") || workOrderDetail.includes("Asset Selector")) {
  failures.push("WorkOrderDetailPage: dead local-only asset selector must not return");
}
if (!workOrderDetail.includes('kind="unit"') || !workOrderDetail.includes("Change in Edit")) {
  failures.push("WorkOrderDetailPage: current asset must drill through and route changes to the wired Edit flow");
}
for (const [file, prefixes] of Object.entries(REQUIRED)) {
  let src;
  try { src = readFileSync(file, "utf8"); } catch { failures.push(`${file} (missing)`); continue; }

  // Check file has at least one navigating element — either a react-router Link or an EntityLink.
  if (!/<Link\s+to=/.test(src) && !/<EntityLink\s+kind=/.test(src)) {
    failures.push(`${file}: no <Link to=…> or <EntityLink kind=…> record cells at all`);
  }

  for (const p of prefixes) {
    // Accept <Link to={`/prefix...`}> (original pattern).
    const linkRe = new RegExp("to=\\{`" + p.replace(/\//g, "\\/"));
    // Accept <EntityLink kind="kind"> as an alternative (resolves to the same route internally).
    const entityKind = PREFIX_TO_ENTITY_KIND[p];
    const entityRe = entityKind ? new RegExp(`<EntityLink[^>]+kind="${entityKind}"`) : null;

    if (!linkRe.test(src) && !(entityRe && entityRe.test(src))) {
      const altHint = entityKind ? ` or <EntityLink kind="${entityKind}">` : "";
      failures.push(`${file}: missing record-cell link to ${p}{id} (need <Link to=\`${p}…\`>${altHint})`);
    }
  }
}

if (failures.length) fail("record cells must be anchors (no plain-text record cells):\n  " + failures.join("\n  "));
console.log(`OK verify-maintenance-record-cells-link: ${Object.keys(REQUIRED).length} ParityTable tabs have navigating record cells.`);
