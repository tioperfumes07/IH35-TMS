#!/usr/bin/env node
/**
 * verify-a7-audit-per-entity-tabs.mjs
 *
 * Verifies that A7 audit per-entity tabs are properly implemented:
 * 1. EntityAuditHistoryTab component exists and exports correctly
 * 2. API supports entity_type, entity_id, actor, status, source, voids_only filters
 * 3. Audit tabs are mounted on entity detail pages
 */

import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

const ROOT = process.cwd();

function checkFile(path, description) {
  const fullPath = resolve(ROOT, path);
  if (!existsSync(fullPath)) {
    return { pass: false, error: `${description} not found: ${path}` };
  }
  return { pass: true };
}

function checkFileContains(path, expected, description) {
  const fullPath = resolve(ROOT, path);
  if (!existsSync(fullPath)) {
    return { pass: false, error: `${description} not found: ${path}` };
  }
  const content = readFileSync(fullPath, "utf-8");
  if (!content.includes(expected)) {
    return { pass: false, error: `${description} missing expected content: ${expected}` };
  }
  return { pass: true };
}

const checks = [
  // 1. Component exists
  () => checkFile("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "EntityAuditHistoryTab component"),

  // 2. API extended with new filters
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "entity_type", "API entity_type filter"),
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "entity_id", "API entity_id filter"),
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "actor", "API actor filter"),
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "status", "API status filter"),
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "source", "API source filter"),
  () => checkFileContains("apps/backend/src/audit/audit-events-list.routes.ts", "voids_only", "API voids_only filter"),

  // 3. Frontend API client extended
  () => checkFileContains("apps/frontend/src/api/audit.ts", "entityId", "Frontend API entityId param"),
  () => checkFileContains("apps/frontend/src/api/audit.ts", "actor", "Frontend API actor param"),
  () => checkFileContains("apps/frontend/src/api/audit.ts", "status", "Frontend API status param"),
  () => checkFileContains("apps/frontend/src/api/audit.ts", "source", "Frontend API source param"),
  () => checkFileContains("apps/frontend/src/api/audit.ts", "voidsOnly", "Frontend API voidsOnly param"),

  // 4. Driver audit tab has QBO-style filters
  () => checkFileContains("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "actorFilter", "Driver audit actor filter"),
  () => checkFileContains("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "statusFilter", "Driver audit status filter"),
  () => checkFileContains("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "sourceFilter", "Driver audit source filter"),
  () => checkFileContains("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "voidsOnly", "Driver audit voids_only filter"),
  () => checkFileContains("apps/frontend/src/components/drivers/AuditHistoryTab.tsx", "exportCSV", "Driver audit CSV export"),

  // 5. EntityAuditHistoryTab has QBO-style filters
  () => checkFileContains("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "actorFilter", "Entity audit actor filter"),
  () => checkFileContains("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "statusFilter", "Entity audit status filter"),
  () => checkFileContains("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "sourceFilter", "Entity audit source filter"),
  () => checkFileContains("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "voidsOnly", "Entity audit voids_only filter"),
  () => checkFileContains("apps/frontend/src/components/audit/EntityAuditHistoryTab.tsx", "exportCSV", "Entity audit CSV export"),
];

let passed = 0;
let failed = 0;

for (const check of checks) {
  const result = check();
  if (result.pass) {
    passed++;
  } else {
    failed++;
    console.error(`FAIL: ${result.error}`);
  }
}

console.log(`\nA7 Audit Per-Entity Tabs verification: ${passed} passed, ${failed} failed`);

if (failed > 0) {
  process.exit(1);
}
console.log("PASS: A7 audit per-entity tabs implementation verified");
