#!/usr/bin/env node
/**
 * HONEST-BUILT-LAUNCH-LAW 2026-08-14: class regression only — NO @matrix-built Box-3 credit.
 * Former leafRe `.*(trailer|equipment).*` was theater.
 */
// GAP-37 / G14 / WF-047 — CI guard for dispatch equipment dual-confirm transfer.
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const failures = [];

function transferKindFailures({ modal, entityPicker, createTrailer, pickerRegistry, equipmentRoutes, requestService, routes }) {
  const out = [];
  const requirePattern = (source, pattern, message) => {
    if (!pattern.test(source)) out.push(message);
  };
  requirePattern(modal, /equipmentKind=\{kind\}/, "modal must pass selected subtype into the canonical equipment picker");
  requirePattern(modal, /setKind\([\s\S]{0,160}setEquipmentUuid\(""\)/, "changing subtype must clear the prior equipment selection");
  requirePattern(pickerRegistry, /equipment_kind:\s*opts\?\.equipmentKind/, "picker registry must send subtype to the server roster");
  requirePattern(entityPicker, /equipmentKind \?\? "trailer"/, "all canonical trailer pickers must default to a trailer-only roster");
  requirePattern(entityPicker, /equipmentKind=\{effectiveEquipmentKind\}/, "nested create must receive the same subtype as the roster");
  requirePattern(createTrailer, /equipmentKind === "trailer"[\s\S]{0,100}type !== "Chassis"/, "trailer inline create must exclude chassis rows");
  requirePattern(createTrailer, /equipmentKind === "chassis"[\s\S]{0,100}\["Chassis"\]/, "chassis inline create must expose only Chassis");
  requirePattern(equipmentRoutes, /equipment_kind:\s*z\.enum\(\["trailer",\s*"chassis"\]\)/, "equipment list must validate the subtype query");
  requirePattern(equipmentRoutes, /equipment_type = 'Chassis'[\s\S]{0,120}equipment_type <> 'Chassis'/, "equipment list must filter chassis and trailers distinctly");
  requirePattern(requestService, /actualKind[\s\S]{0,160}equipment_kind_mismatch/, "writer must reject an equipment row whose stored type contradicts the payload kind");
  requirePattern(routes, /equipment_kind_mismatch/, "route must expose a typed mismatch response");
  return out;
}

function lifecycleFailures(service, routeSource) {
  const out = [];
  const requirePattern = (source, pattern, message) => {
    if (!pattern.test(source)) out.push(message);
  };
  requirePattern(service, /status = 'pending_outbound'[\s\S]{0,100}RETURNING uuid::text[\s\S]{0,180}if \(!transferUpdate\.rows\[0\]\?\.uuid\) return \{ kind: "invalid_status" \}/, "outbound confirmation must CAS and check pending_outbound");
  requirePattern(service, /status = 'outbound_confirmed'[\s\S]{0,100}RETURNING uuid::text[\s\S]{0,180}if \(!transferUpdate\.rows\[0\]\?\.uuid\) return \{ kind: "invalid_status" \}/, "inbound confirmation must CAS and check outbound_confirmed");
  requirePattern(service, /UPDATE mdata\.equipment[\s\S]{0,240}RETURNING id::text[\s\S]{0,180}if \(!equipmentUpdate\.rows\[0\]\?\.id\) return \{ kind: "equipment_not_found" \}/, "inbound confirmation must reject a missing/cross-company equipment update");
  requirePattern(service, /const equipmentLogId = String\(logRes\.rows\[0\]\?\.id \?\? ""\);[\s\S]{0,100}if \(!equipmentLogId\) throw new Error\("equipment_log_create_failed"\);[\s\S]{0,180}appendCrudAudit/, "inbound confirmation must require the equipment-log identity before audit/notify");
  requirePattern(routeSource, /result\.kind === "equipment_not_found"[\s\S]{0,80}reply\.code\(404\)/, "route must expose equipment_not_found without a generic 500");
  requirePattern(routeSource, /equipment_log_create_failed[\s\S]{0,120}reply\.code\(409\)/, "route must expose equipment_log_create_failed as a typed conflict");
  return out;
}

function initiationIdentityFailures(service, routeSource) {
  const out = [];
  if (!/const uuid = String\(res\.rows\[0\]\?\.uuid \?\? ""\);[\s\S]{0,100}if \(!uuid\) throw new Error\("transfer_create_failed"\);[\s\S]{0,180}appendCrudAudit/.test(service)) {
    out.push("initiation must require the canonical INSERT identity before audit/outbox side effects");
  }
  if (!/code === "transfer_create_failed"[\s\S]{0,100}status: 409/.test(routeSource)) {
    out.push("route must expose transfer_create_failed as a typed conflict");
  }
  return out;
}

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
failures.push(...lifecycleFailures(dualConfirm, routes));
failures.push(...initiationIdentityFailures(requestService, routes));

const indexTs = read("apps/backend/src/index.ts");
contains("apps/backend/src/index.ts", indexTs, [
  { pattern: /registerEquipmentTransferRoutes/, label: "routes wired in index" },
  { pattern: /dispatch\/equipment-transfer\/routes/, label: "dispatch equipment-transfer import" },
]);

const transferModal = read("apps/frontend/src/components/dispatch/EquipmentTransferModal.tsx");
const entityPicker = read("apps/frontend/src/components/parity/EntityPicker.tsx");
const createTrailer = read("apps/frontend/src/components/fleet/CreateTrailerModal.tsx");
const pickerRegistry = read("apps/frontend/src/components/parity/entityPickerRegistry.ts");
const equipmentRoutes = read("apps/backend/src/mdata/equipment.routes.ts");
failures.push(...transferKindFailures({ modal: transferModal, entityPicker, createTrailer, pickerRegistry, equipmentRoutes, requestService, routes }));

if (process.argv.includes("--selftest")) {
  const good = { modal: transferModal, entityPicker, createTrailer, pickerRegistry, equipmentRoutes, requestService, routes };
  const mutations = [
    { ...good, modal: good.modal.replace("equipmentKind={kind}", "") },
    { ...good, modal: good.modal.replaceAll('setEquipmentUuid("");', "") },
    { ...good, pickerRegistry: good.pickerRegistry.replace("equipment_kind: opts?.equipmentKind", "") },
    { ...good, equipmentRoutes: good.equipmentRoutes.replace("equipment_type <> 'Chassis'", "equipment_type = 'Chassis'") },
    { ...good, requestService: good.requestService.replace('throw new Error("equipment_kind_mismatch")', "return input.equipment_uuid") },
    { ...good, entityPicker: good.entityPicker.replace('equipmentKind ?? "trailer"', 'equipmentKind') },
    { ...good, createTrailer: good.createTrailer.replace('type !== "Chassis"', 'type === "Chassis"') },
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (transferKindFailures(mutation).length === 0) fail(`selftest mutation ${index + 1} escaped the subtype guard`);
  }
  const lifecycleMutations = [
    dualConfirm.replace("AND status = 'pending_outbound'", ""),
    dualConfirm.replace("AND status = 'outbound_confirmed'", ""),
    dualConfirm.replace("RETURNING uuid::text", ""),
    dualConfirm.replace('if (!transferUpdate.rows[0]?.uuid) return { kind: "invalid_status" };', ""),
    dualConfirm.replace("RETURNING id::text", ""),
    dualConfirm.replace('if (!equipmentUpdate.rows[0]?.id) return { kind: "equipment_not_found" };', ""),
    routes.replaceAll('if (result.kind === "equipment_not_found") return reply.code(404).send({ error: "equipment_not_found" });', ""),
    dualConfirm.replace('if (!equipmentLogId) throw new Error("equipment_log_create_failed");', ""),
    routes.replace('return reply.code(409).send({ error: "equipment_log_create_failed" });', 'return reply.code(500).send({ error: "equipment_log_create_failed" });'),
  ];
  for (const [index, mutation] of lifecycleMutations.entries()) {
    const routeMutation = index === lifecycleMutations.length - 1;
    if (lifecycleFailures(routeMutation ? dualConfirm : mutation, routeMutation ? mutation : routes).length === 0) {
      fail(`selftest lifecycle mutation ${index + 1} escaped the guard`);
    }
  }
  const initiationMutations = [
    requestService.replace('if (!uuid) throw new Error("transfer_create_failed");', ""),
    routes.replace('if (code === "transfer_create_failed") return { status: 409, payload: { error: code } };', ""),
  ];
  for (const [index, mutation] of initiationMutations.entries()) {
    const routeMutation = index === 1;
    if (initiationIdentityFailures(routeMutation ? requestService : mutation, routeMutation ? mutation : routes).length === 0) {
      fail(`selftest initiation mutation ${index + 1} escaped the guard`);
    }
  }
}
const transfersPage = read("apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx");
contains("apps/frontend/src/pages/dispatch/EquipmentTransferRequests.tsx", transfersPage, [
  { pattern: /query\.isError/, label: "failed-list branch" },
  { pattern: /ListErrorState/, label: "retryable list error state" },
  { pattern: /query\.refetch\(\)/, label: "failed-list retry action" },
]);

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

console.log(`verify:equipment-transfer-dual-confirm — OK${process.argv.includes("--selftest") ? "; 7 subtype + 11 lifecycle mutations caught" : ""}`);
