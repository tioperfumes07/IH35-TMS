#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function fail(message) {
  failures.push(message);
}

function read(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`MISSING: ${relativePath}`);
    return "";
  }
  return fs.readFileSync(absolutePath, "utf8");
}

function contains(relativePath, content, checks) {
  if (!content) return;
  for (const check of checks) {
    const pattern = check.pattern instanceof RegExp ? check.pattern : new RegExp(check.pattern);
    if (!pattern.test(content)) {
      fail(`${relativePath}: missing ${check.label}`);
    }
  }
}

const migration = read("db/migrations/0407_permits_toll_tags.sql");
contains("db/migrations/0407_permits_toll_tags.sql", migration, [
  { pattern: /master_data\.unit_permits/, label: "unit_permits table" },
  { pattern: /master_data\.unit_toll_tags/, label: "unit_toll_tags table" },
  { pattern: /deleted_at/, label: "soft-delete column" },
  { pattern: /idx_permits_unit_exp/, label: "permits expiry index" },
]);

const permitRoutes = read("apps/backend/src/master-data/units/permits/routes.ts");
contains("apps/backend/src/master-data/units/permits/routes.ts", permitRoutes, [
  { pattern: /\/api\/units\/:unit_uuid\/permits/, label: "permits list/create route" },
  { pattern: /app\.delete\("\/api\/units\/:unit_uuid\/permits\/:uuid"/, label: "permits soft-delete route" },
  { pattern: /registerUnitPermitsRoutes/, label: "permits routes register export" },
]);

const tollRoutes = read("apps/backend/src/master-data/units/toll-tags/routes.ts");
contains("apps/backend/src/master-data/units/toll-tags/routes.ts", tollRoutes, [
  { pattern: /\/api\/units\/:unit_uuid\/toll-tags/, label: "toll tags list/create route" },
  { pattern: /app\.delete\("\/api\/units\/:unit_uuid\/toll-tags\/:uuid"/, label: "toll tags soft-delete route" },
  { pattern: /registerUnitTollTagsRoutes/, label: "toll tag routes register export" },
]);

read("apps/backend/src/master-data/units/permits/__tests__/permits.test.ts");
read("apps/backend/src/master-data/units/toll-tags/__tests__/toll-tags.test.ts");

const permitService = read("apps/backend/src/master-data/units/permits/service.ts");
contains("apps/backend/src/master-data/units/permits/service.ts", permitService, [
  { pattern: /scanUnitPermitExpiries/, label: "unit permit expiry scan" },
  { pattern: /master_data\.unit_permits/, label: "permit monitor query" },
]);

const certMonitorJob = read("apps/backend/src/jobs/cert-expiry-monitor.ts");
contains("apps/backend/src/jobs/cert-expiry-monitor.ts", certMonitorJob, [
  { pattern: /scanUnitPermitExpiries/, label: "permit expiry wired to daily monitor" },
  { pattern: /gap-85-permit-toll/, label: "gap-85 notification source" },
]);

const permitsTab = read("apps/frontend/src/pages/units/UnitPermitsTab.tsx");
contains("apps/frontend/src/pages/units/UnitPermitsTab.tsx", permitsTab, [
  { pattern: /UnitPermitsTab/, label: "permits tab export" },
  { pattern: /unit-permits-tab/, label: "permits tab test id" },
  { pattern: /CertExpiryBadge/, label: "expiry badge" },
  { pattern: /\/api\/units\//, label: "permits API call" },
]);

const tollTab = read("apps/frontend/src/pages/units/UnitTollTagsTab.tsx");
contains("apps/frontend/src/pages/units/UnitTollTagsTab.tsx", tollTab, [
  { pattern: /UnitTollTagsTab/, label: "toll tags tab export" },
  { pattern: /unit-toll-tags-tab/, label: "toll tags tab test id" },
  { pattern: /balance_current/, label: "balance display" },
]);

const unitDetail = read("apps/frontend/src/pages/units/UnitDetail.tsx");
contains("apps/frontend/src/pages/units/UnitDetail.tsx", unitDetail, [
  { pattern: /UnitDetail/, label: "unit detail export" },
  { pattern: /UnitPermitsTab/, label: "permits tab mounted" },
  { pattern: /UnitTollTagsTab/, label: "toll tags tab mounted" },
]);

const docs = read("docs/specs/gap-85-permits-toll-tags.md");
contains("docs/specs/gap-85-permits-toll-tags.md", docs, [
  { pattern: /GAP-85/, label: "GAP-85 identifier" },
  { pattern: /\/api\/units\/.*\/permits/, label: "permits routes documented" },
  { pattern: /\/api\/units\/.*\/toll-tags/, label: "toll tag routes documented" },
]);

const manifest = read(".block-ready.json");
if (/GAP-85-PERMIT-TOLL-TRACKING/.test(manifest)) {
  contains(".block-ready.json", manifest, [
    { pattern: /GAP-85-PERMIT-TOLL-TRACKING/, label: "GAP-85 block id in manifest" },
  ]);
}

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerUnitPermitsRoutes/, label: "permits routes wired in index" },
  { pattern: /registerUnitTollTagsRoutes/, label: "toll tag routes wired in index" },
]);

if (failures.length > 0) {
  console.error("verify:permits-toll-tags — FAILED");
  for (const entry of failures) {
    console.error(`  ✗ ${entry}`);
  }
  process.exit(1);
}

console.log("verify:permits-toll-tags — OK");
