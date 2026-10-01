#!/usr/bin/env node
/**
 * ORDERS-2026-10-01 MAINTENANCE — file_links work_order + maint engines widget.
 * Asserts migration, 3-way docs contract includes work_order, ensureLinkEntityExists
 * branch, DocumentsTab on WO detail, MaintEnginesStatusWidget on home.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "verify-maint-filelinks-engine-widget";

const FILES = {
  migration: "db/migrations/202610011200_file_links_work_order_entity_type.sql",
  backend: "apps/backend/src/docs/files.routes.ts",
  labels: "apps/backend/src/docs/entity-labels.ts",
  feDocs: "apps/frontend/src/api/docs.ts",
  docsTab: "apps/frontend/src/components/documents/DocumentsTab.tsx",
  woDetail: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx",
  home: "apps/frontend/src/pages/maintenance/MaintenanceHome.tsx",
  widget: "apps/frontend/src/pages/maintenance/components/MaintEnginesStatusWidget.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const fails = [];

if (!fs.existsSync(path.join(ROOT, FILES.migration))) {
  fails.push(`missing ${FILES.migration}`);
} else {
  const mig = read(FILES.migration);
  if (!/work_order/.test(mig)) fails.push(`${FILES.migration}: must admit work_order`);
  if (!/cash_advance/.test(mig)) fails.push(`${FILES.migration}: must restore cash_advance in CHECK`);
  if (!/chk_file_links_entity_type_widened_work_order/.test(mig)) {
    fails.push(`${FILES.migration}: constraint name chk_file_links_entity_type_widened_work_order`);
  }
}

const be = read(FILES.backend);
if (!/"work_order"/.test(be)) fails.push(`${FILES.backend}: work_order missing from supported types`);
if (!/entityType === "work_order"/.test(be)) fails.push(`${FILES.backend}: ensureLinkEntityExists work_order branch`);
if (!/maintenance\.work_orders/.test(be)) fails.push(`${FILES.backend}: work_order existence must query maintenance.work_orders`);

const labels = read(FILES.labels);
if (!/work_order:\s*\{/.test(labels)) fails.push(`${FILES.labels}: ENTITY_LABEL_SQL.work_order`);

const fe = read(FILES.feDocs);
if (!/"work_order"/.test(fe)) fails.push(`${FILES.feDocs}: FileEntityType must include work_order`);

const docsTab = read(FILES.docsTab);
if (!/\| "work_order"/.test(docsTab)) fails.push(`${FILES.docsTab}: entityType prop must allow work_order`);

const wo = read(FILES.woDetail);
if (!/data-testid="wo-documents"/.test(wo)) fails.push(`${FILES.woDetail}: wo-documents section`);
if (!/entityType="work_order"/.test(wo)) fails.push(`${FILES.woDetail}: DocumentsTab entityType=work_order`);
if (/wo-documents-pending|document attachments pending/.test(wo)) {
  fails.push(`${FILES.woDetail}: documents pending placeholder must be removed`);
}

const home = read(FILES.home);
if (!/MaintEnginesStatusWidget/.test(home)) fails.push(`${FILES.home}: must mount MaintEnginesStatusWidget`);

const widget = read(FILES.widget);
if (!/domain === "Maintenance"/.test(widget)) fails.push(`${FILES.widget}: filter Maintenance domain`);
if (!/data-testid="maint-engines-status-widget"/.test(widget)) {
  fails.push(`${FILES.widget}: maint-engines-status-widget test id`);
}

const contract = spawnSync(process.execPath, ["scripts/verify-docs-file-link-entity-contract.mjs"], {
  cwd: ROOT,
  encoding: "utf8",
});
if (contract.status !== 0) {
  fails.push(`verify-docs-file-link-entity-contract exit ${contract.status}: ${(contract.stdout || "") + (contract.stderr || "")}`);
}

if (fails.length) {
  console.error(`${LABEL}: FAIL`);
  for (const f of fails) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(`${LABEL}: OK — work_order file_links + DocumentsTab + maint engines widget`);
process.exit(0);
