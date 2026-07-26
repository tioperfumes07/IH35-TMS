#!/usr/bin/env node
/**
 * MNT-LINK-04 — maintenance_vendors.linked_vendor_id → mdata.vendors
 *               + road_service_tickets.vendor_id repointed off RETIRE qbo_vendors.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const MIG = "db/migrations/202609100000_mnt_link_04_maintenance_vendor_ap_link.sql";
const HELD = "db/migrations/.held-migrations.json";
const VENDORS_ROUTES = "apps/backend/src/maintenance/vendors.routes.ts";
const TICKETS_ROUTES = "apps/backend/src/maintenance/road-service/tickets.routes.ts";

function fail(msg) {
  console.error(`verify-mnt-link-04-maintenance-vendor-ap FAILED — ${msg}`);
  process.exit(1);
}

function main() {
  if (!fs.existsSync(path.join(ROOT, MIG))) fail(`missing ${MIG}`);
  const mig = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  if (!/DO NOT RUN ON PROD/.test(mig)) fail(`${MIG} must carry DO NOT RUN ON PROD`);
  if (!/linked_vendor_id/.test(mig)) fail(`${MIG} must add linked_vendor_id`);
  if (!/fk_maintenance_vendors_linked_vendor/.test(mig)) fail(`${MIG} must name catalog FK`);
  if (!/REFERENCES\s+mdata\.vendors\s*\(\s*id\s*\)/i.test(mig)) {
    fail(`${MIG} must FK → mdata.vendors(id)`);
  }
  if (!/DROP CONSTRAINT\s+road_service_tickets_vendor_id_fkey/i.test(mig)) {
    fail(`${MIG} must drop RETIRE qbo_vendors FK`);
  }
  if (!/fk_road_service_tickets_vendor_mdata/.test(mig)) {
    fail(`${MIG} must add fk_road_service_tickets_vendor_mdata`);
  }
  if (!/NOT VALID/.test(mig) || !/VALIDATE CONSTRAINT/.test(mig)) {
    fail(`${MIG} must use NOT VALID → VALIDATE`);
  }

  const held = JSON.parse(fs.readFileSync(path.join(ROOT, HELD), "utf8"));
  const fname = path.basename(MIG);
  if (!(held.held ?? []).some((e) => e.file === fname)) {
    fail(`${fname} must be in .held-migrations.json held[]`);
  }
  for (const e of held.held ?? []) {
    if (e.file === fname && "applied_on_prod" in e && e.applied_on_prod !== true) {
      fail(`${fname}: omit applied_on_prod (false is illegal)`);
    }
  }

  const vendors = fs.readFileSync(path.join(ROOT, VENDORS_ROUTES), "utf8");
  if (!/linked_vendor_id/.test(vendors)) {
    fail(`${VENDORS_ROUTES} must write/read linked_vendor_id`);
  }

  const tickets = fs.readFileSync(path.join(ROOT, TICKETS_ROUTES), "utf8");
  if (!/vendor_id:\s*z\.string\(\)\.uuid\(\)/.test(tickets)) {
    fail(`${TICKETS_ROUTES} must require vendor_id (canonical AP vendor)`);
  }
  if (!/FROM mdata\.vendors/.test(tickets)) {
    fail(`${TICKETS_ROUTES} must validate vendor_id against mdata.vendors`);
  }
  if (/qbo_vendors/.test(tickets)) {
    fail(`${TICKETS_ROUTES} must not reference RETIRE mdata.qbo_vendors`);
  }

  console.log("verify-mnt-link-04-maintenance-vendor-ap OK — HELD mig + AP FK + road-service require mdata.vendors");
}

main();
