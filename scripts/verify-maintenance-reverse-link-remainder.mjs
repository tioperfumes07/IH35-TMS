#!/usr/bin/env node
/**
 * Maintenance reverse_link remainder — Built for list/detail EntityLink surfaces.
 * Create/source/modal chrome honesty-dropped in required.json.
 *
 * @matrix-built {"modules":["maintenance"],"cols":["reverse_link"],"leafRe":"^(in_transit\\.promote_to_wo|arriving_soon\\.convert_to_wo|driver_reports\\.queue|severe_repairs\\.convert_to_wo|defects\\.convert_to_wo|pre_flight_dvir\\.queue|pm\\.auto_engine\\.run|fault_drafts\\.review|warranty\\.create_claim|maintenance\\.panel\\.road_service_active|maintenance\\.modal\\.work_order_detail)$","task":"VERTICAL-REVERSE-LINK-maintenance-remainder","vertical":"column-wave"}
 *
 * Self-test: node scripts/verify-maintenance-reverse-link-remainder.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-maintenance-reverse-link-remainder";
const ROUTES = "apps/backend/src/maintenance/work-orders.routes.ts";
const API = "apps/frontend/src/api/maintenance.ts";
const TABLE = "apps/frontend/src/pages/maintenance/components/WorkOrdersTable.tsx";

const CHECKS = [
  { name: "InTransitIssuesTable", file: "apps/frontend/src/pages/maintenance/components/InTransitIssuesTable.tsx" },
  { name: "TriageModal", file: "apps/frontend/src/pages/maintenance/components/TriageModal.tsx" },
  { name: "ArrivingSoonPage", file: "apps/frontend/src/pages/maintenance/ArrivingSoonPage.tsx" },
  { name: "ArrivingSoonCard", file: "apps/frontend/src/pages/maintenance/components/ArrivingSoonCard.tsx" },
  { name: "ConvertIssueToWOModal", file: "apps/frontend/src/pages/maintenance/components/ConvertIssueToWOModal.tsx" },
  { name: "DriverReportsQueuePage", file: "apps/frontend/src/pages/maintenance/DriverReportsQueuePage.tsx" },
  { name: "SevereRepairOosTab", file: "apps/frontend/src/pages/maintenance/components/SevereRepairOosTab.tsx" },
  { name: "DefectsInboxPage", file: "apps/frontend/src/pages/maintenance/DefectsInboxPage.tsx" },
  { name: "PreFlightDvirQueue", file: "apps/frontend/src/pages/maintenance/pre-flight/PreFlightDvirQueue.tsx" },
  { name: "PmAutoEnginePage", file: "apps/frontend/src/pages/maintenance/PmAutoEnginePage.tsx" },
  { name: "FaultDraftsPage", file: "apps/frontend/src/pages/maintenance/FaultDraftsPage.tsx" },
  { name: "WarrantyClaimsPage", file: "apps/frontend/src/pages/maintenance/WarrantyClaimsPage.tsx" },
  { name: "RoadServiceList", file: "apps/frontend/src/pages/maintenance/RoadServiceList.tsx" },
  { name: "WorkOrderDetailPage", file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx" },
];

function run(root = ROOT) {
  const fails = [];
  const routes = fs.readFileSync(path.join(root, ROUTES), "utf8");
  const api = fs.readFileSync(path.join(root, API), "utf8");
  const table = fs.readFileSync(path.join(root, TABLE), "utf8");
  const equipmentJoins = routes.match(/LEFT JOIN mdata\.equipment e[\s\S]{0,180}COALESCE\(e\.currently_leased_to_company_id, e\.owner_company_id\) = w\.operating_company_id/g) ?? [];
  if (equipmentJoins.length < 2) fails.push("work-order list/detail must resolve trailer labels through two entity-scoped equipment joins");
  if ((routes.match(/e\.equipment_number/g) ?? []).length < 2) fails.push("work-order list/detail payloads must select equipment_number");
  if (!/equipment_id\?: string \| null;[\s\S]{0,80}equipment_number\?: string \| null;/.test(api)) fails.push("WorkOrder API type must expose trailer FK and label");
  if (!/kind="trailer" id=\{row\.equipment_id\} name=\{row\.equipment_number\} noun="Trailer"/.test(table)) fails.push("work-order list must drill to its trailer");
  for (const c of CHECKS) {
    const abs = path.join(root, c.file);
    if (!fs.existsSync(abs)) {
      fails.push(`${c.name}: missing`);
      continue;
    }
    const src = fs.readFileSync(abs, "utf8");
    if (!/EntityLink/.test(src)) fails.push(`${c.name}: no EntityLink`);
    if (c.name === "InTransitIssuesTable") {
      for (const pattern of [
        /kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_display_id\} noun="Unit"/,
        /kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_full_name\} noun="Driver"/,
        /kind="load" id=\{issue\.load_id\} name=\{issue\.load_display_id\} noun="Load"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact nullable FK/name tombstone coupling missing`);
    }
    if (c.name === "TriageModal") {
      for (const pattern of [
        /kind="unit" id=\{issue\.unit_id\} name=\{issue\.unit_display_id\} noun="Unit"/,
        /kind="driver" id=\{issue\.driver_id\} name=\{issue\.driver_full_name\} noun="Driver"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact nullable FK/name tombstone coupling missing`);
    }
    if (["ArrivingSoonPage", "ArrivingSoonCard", "ConvertIssueToWOModal"].includes(c.name)) {
      for (const pattern of [
        /kind="unit" id=\{card\.unit_id\} name=\{card\.unit_number\} noun="Unit"/,
        /kind="driver" id=\{card\.driver_id\} name=\{card\.driver_name\} noun="Driver"/,
        /kind="load" id=\{card\.load_id\} name=\{card\.load_display_id\} noun="Load"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact nullable FK/name tombstone coupling missing`);
    }
    if (c.name === "SevereRepairOosTab") {
      for (const pattern of [
        /kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/,
        /kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
        /kind="unit" id=\{returnEstimate\?\.unit_id\} name=\{returnEstimate\?\.unit_number\} noun="Unit"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact nullable FK/name tombstone coupling missing`);
    }
    if (c.name === "DefectsInboxPage") {
      for (const pattern of [
        /kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/,
        /kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
        /kind="work_order"[\s\S]{0,120}id=\{row\.follow_up_wo_id\}[\s\S]{0,120}name=\{row\.follow_up_wo_display_id\}[\s\S]{0,80}noun="Work order"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact nullable FK/name tombstone coupling missing`);
    }
    if (c.name === "PreFlightDvirQueue") {
      for (const pattern of [
        /kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/,
        /kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
        /row\.work_order_id \? \([\s\S]{0,120}<EntityLinkOrTombstone kind="work_order" id=\{row\.work_order_id\} name=\{row\.work_order_display_id\} noun="Work order"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact canonical FK/name tombstone coupling missing`);
      if (/row\.auto_wo_id \?|id=\{row\.work_order_id \?\? row\.auto_wo_id\}/.test(src)) {
        fails.push(`${c.name}: legacy auto_wo_id controls canonical work-order drill`);
      }
    }
    if (c.name === "PmAutoEnginePage") {
      for (const pattern of [
        /kind="pm_schedule"[\s\S]{0,80}id=\{entry\.pm_schedule_id\}[\s\S]{0,80}name=\{entry\.schedule_label\}[\s\S]{0,40}noun="Schedule"/,
        /kind="unit" id=\{entry\.unit_id\} name=\{entry\.unit_number\} noun="Unit"/,
        /kind="work_order" id=\{entry\.work_order_id\} name=\{entry\.work_order_display_id\} noun="Work order"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact action-log FK/name tombstone coupling missing`);
      if (/entry\.unit_number \?/.test(src)) fails.push(`${c.name}: unit drill incorrectly gated on optional display label`);
    }
    if (c.name === "FaultDraftsPage") {
      for (const pattern of [
        /kind="unit" id=\{row\.unit_id\} name=\{row\.unit_number\} noun="Unit"/,
        /kind="unit" id=\{selected\.unit_id\} name=\{selected\.unit_number\} noun="Unit"/,
        /kind="work_order"[\s\S]{0,80}id=\{selected\.id\}/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact list/modal reverse identity coupling missing`);
    }
    if (c.name === "WarrantyClaimsPage") {
      for (const pattern of [
        /kind="vendor" id=\{row\.vendor_id\} name=\{row\.vendor_name\} noun="Vendor"/,
        /kind="work_order" id=\{row\.work_order_id\} name=\{row\.work_order_display_id\} noun="Work order"/,
        /kind="vendor" id=\{fileTarget\?\.vendor_id\} name=\{fileTarget\?\.vendor_name\} noun="Vendor"/,
        /kind="work_order" id=\{fileTarget\?\.work_order_id\} name=\{fileTarget\?\.work_order_display_id\} noun="Work order"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact list/file-modal reverse identity coupling missing`);
    }
    if (c.name === "RoadServiceList") {
      for (const pattern of [
        /kind="work_order"[\s\S]{0,100}id=\{row\.wo_id\}[\s\S]{0,100}name=\{row\.work_order_display_id\}/,
        /kind="unit" id=\{row\.unit_id\} name=\{row\.unit_display_id\} noun="Unit"/,
        /kind="driver" id=\{row\.driver_id\} name=\{row\.driver_name\} noun="Driver"/,
        /kind="vendor" id=\{row\.vendor_id\} name=\{row\.vendor_name\} noun="Vendor"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact ticket reverse identity coupling missing`);
      if (/kind="work_order"[\s\S]{0,100}name=\{row\.ticket_number\}/.test(src)) {
        fails.push(`${c.name}: road-service ticket number mislabeled as work-order identity`);
      }
    }
    if (c.name === "WorkOrderDetailPage") {
      for (const pattern of [
        /kind="unit" id=\{wo\.unit_id as string \| null\} name=\{wo\.unit_number\} noun="Unit"/,
        /kind="load" id=\{wo\.load_id as string \| null\} name=\{wo\.linked_load_number\} noun="Load"/,
        /kind="load" id=\{wo\.roadside_breakdown_load_id as string \| null\} name=\{wo\.roadside_breakdown_load_number\} noun="Load"/,
        /kind="driver" id=\{wo\.driver_id as string \| null\} name=\{wo\.driver_name\} noun="Driver"/,
        /kind="vendor" id=\{wo\.resolved_vendor_id as string \| null\} name=\{wo\.resolved_vendor_name\} noun="Vendor"/,
        /kind="claim" id=\{wo\.insurance_claim_id as string \| null\} name=\{wo\.insurance_claim_number\} noun="Claim"/,
        /kind="trailer" id=\{wo\.equipment_id\} name=\{wo\.equipment_number\} noun="Trailer"/,
      ]) if (!pattern.test(src)) fails.push(`${c.name}: exact forward-link identity coupling missing`);
    }
    if (c.name === "ArrivingSoonCard" && (/href=\{`\/dispatch`\}/.test(src) || /Call Driver/.test(src))) {
      fails.push(`${c.name}: dead generic load or driver action remains`);
    }
  }
  return fails;
}

if (process.argv.includes("--selftest")) {
  const live = run();
  const tmp = fs.mkdtempSync(path.join(ROOT, "scripts", ".maint-reverse-selftest-"));
  try {
    for (const file of [ROUTES, API, TABLE]) {
      const abs = path.join(tmp, file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    for (const c of CHECKS) {
      const abs = path.join(tmp, c.file);
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, "// poison\n");
    }
    const planted = run(tmp);
    if (planted.length < CHECKS.length) {
      console.error(`${LABEL} SELFTEST FAIL (${planted.length})`);
      process.exit(1);
    }
    console.log(`${LABEL} SELFTEST PASS (poison trips ${planted.length})`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  if (live.length) {
    console.error(`${LABEL} FAIL live:\n- ${live.join("\n- ")}`);
    process.exit(1);
  }
  process.exit(0);
}

const fails = run();
if (fails.length) {
  console.error(`${LABEL} FAIL:\n- ${fails.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — maintenance reverse_link remainder ratcheted`);
