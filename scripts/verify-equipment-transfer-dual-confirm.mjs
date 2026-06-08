#!/usr/bin/env node
// GAP-37 / G14 / WF-047 — CI guard for dispatch equipment dual-confirm transfer.
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

const migrationPath = "db/migrations/202606080204_equipment_transfer_requests.sql";
const migration = read(migrationPath);
contains(migrationPath, migration, [
  { pattern: /dispatch\.equipment_transfer_requests/, label: "equipment_transfer_requests table" },
  { pattern: /pending_outbound/, label: "pending_outbound status" },
  { pattern: /outbound_confirmed/, label: "outbound_confirmed status" },
  { pattern: /outbound_evidence_uuid/, label: "outbound evidence column" },
  { pattern: /inbound_evidence_uuid/, label: "inbound evidence column" },
  { pattern: /ENABLE ROW LEVEL SECURITY/, label: "RLS enabled" },
  { pattern: /app\.operating_company_id/, label: "operating_company_id RLS pattern" },
  { pattern: /TO ih35_app/, label: "ih35_app grants" },
  { pattern: /GRANT USAGE ON SCHEMA dispatch TO ih35_app/, label: "dispatch schema grant" },
]);

const requestService = read("apps/backend/src/dispatch/equipment-transfer/request.service.ts");
contains("apps/backend/src/dispatch/equipment-transfer/request.service.ts", requestService, [
  { pattern: /export async function initiateTransfer/, label: "initiateTransfer" },
  { pattern: /export async function listPendingForDriver/, label: "listPendingForDriver" },
  { pattern: /export async function cancelTransfer/, label: "cancelTransfer" },
  { pattern: /dispatch\.equipment_transfer_requests/, label: "transfer requests table query" },
  { pattern: /appendCrudAudit/, label: "audit events" },
]);

const dualConfirm = read("apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts");
contains("apps/backend/src/dispatch/equipment-transfer/dual-confirm.service.ts", dualConfirm, [
  { pattern: /export async function confirmOutbound/, label: "confirmOutbound" },
  { pattern: /export async function confirmInbound/, label: "confirmInbound" },
  { pattern: /driver_mismatch/, label: "driver mismatch rejection" },
  { pattern: /assigned_driver_id/, label: "equipment reassignment on inbound" },
  { pattern: /audit_chain/, label: "linked audit chain" },
  { pattern: /status = 'completed'/, label: "completed status on inbound" },
]);

const routes = read("apps/backend/src/dispatch/equipment-transfer/routes.ts");
contains("apps/backend/src/dispatch/equipment-transfer/routes.ts", routes, [
  { pattern: /\/api\/v1\/dispatch\/equipment-transfers\/initiate/, label: "initiate route" },
  { pattern: /\/api\/v1\/dispatch\/equipment-transfers\/pending/, label: "pending route" },
  { pattern: /\/api\/v1\/dispatch\/equipment-transfers\/:uuid\/confirm-outbound/, label: "confirm-outbound route" },
  { pattern: /\/api\/v1\/dispatch\/equipment-transfers\/:uuid\/confirm-inbound/, label: "confirm-inbound route" },
  { pattern: /\/api\/v1\/dispatch\/equipment-transfers\/:uuid\/cancel/, label: "cancel route" },
  { pattern: /registerEquipmentTransferRoutes/, label: "route register export" },
  { pattern: /requireAuth/, label: "requireAuth guard" },
]);

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerEquipmentTransferRoutes/, label: "routes wired in index" },
  { pattern: /dispatch\/equipment-transfer\/routes/, label: "dispatch equipment-transfer import" },
]);

read("apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx");
read("apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx");

const manifest = read("apps/frontend/src/routes/manifest.tsx");
contains("apps/frontend/src/routes/manifest.tsx", manifest, [
  { pattern: /EquipmentTransferRequests/, label: "equipment transfers page import" },
  { pattern: /\/dispatch\/equipment-transfers/, label: "equipment transfers route" },
]);

read("apps/driver-pwa/src/components/equipment/IncomingTransferRequest.tsx");
const pwaComponent = read("apps/driver-pwa/src/components/equipment/IncomingTransferRequest.tsx");
contains("apps/driver-pwa/src/components/equipment/IncomingTransferRequest.tsx", pwaComponent, [
  { pattern: /confirm-outbound/, label: "PWA confirm-outbound call" },
  { pattern: /confirm-inbound/, label: "PWA confirm-inbound call" },
  { pattern: /direction: "outbound"/, label: "outbound pending query" },
  { pattern: /direction: "inbound"/, label: "inbound pending query" },
]);

read("apps/backend/src/dispatch/equipment-transfer/__tests__/request.test.ts");
read("apps/backend/src/dispatch/equipment-transfer/__tests__/dual-confirm.test.ts");

const docs = read("docs/specs/gap-37-equipment-dual-confirm-transfer.md");
contains("docs/specs/gap-37-equipment-dual-confirm-transfer.md", docs, [
  { pattern: /GAP-37/, label: "GAP-37 identifier" },
  { pattern: /WF-047/, label: "WF-047 citation" },
  { pattern: /G14/, label: "G14 citation" },
]);

const pkg = read("package.json");
contains("package.json", pkg, [
  { pattern: /verify:equipment-transfer-dual-confirm/, label: "package.json verify script" },
]);

const ci = read(".github/workflows/ci.yml");
contains(".github/workflows/ci.yml", ci, [
  { pattern: /verify:equipment-transfer-dual-confirm/, label: "CI verify step" },
]);

if (failures.length > 0) {
  console.error("verify:equipment-transfer-dual-confirm — FAILED");
  for (const entry of failures) {
    console.error(`  x ${entry}`);
  }
  process.exit(1);
}

console.log("verify:equipment-transfer-dual-confirm — OK");
