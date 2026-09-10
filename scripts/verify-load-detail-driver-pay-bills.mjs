#!/usr/bin/env node
/**
 * verify-load-detail-driver-pay-bills.mjs
 * FAIL-SETL-DRIVER-PAY-TAB — Load Driver Pay tab must map driver_finance.driver_bills
 * (gross_amount_cents / bill_number / status), not settlement_line fields.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const TARGET = "apps/frontend/src/components/dispatch/LoadDetailDriverPayTab.tsx";
const LABEL = "verify-load-detail-driver-pay-bills";

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    console.error(`[${LABEL}] FAIL: missing ${rel}`);
    process.exit(1);
  }
  return fs.readFileSync(abs, "utf8");
}

function check(src) {
  const errors = [];
  // Intent (still valid): the Driver Pay tab maps the driver's driver_finance.driver_bills header
  // (gross_amount_cents / bill_number / status) and drills the bill through ITS OWN route — never the
  // accounting.bills route (a DIFFERENT table + disjoint id space).
  if (!src.includes("gross_amount_cents")) {
    errors.push("must read gross_amount_cents from the driver bill");
  }
  if (!src.includes("bill_number")) {
    errors.push("must display bill_number");
  }
  if (/once a settlement is composed/.test(src)) {
    errors.push("empty-state must not claim pay only appears after settlement composition");
  }
  // LDT-3 (2026-09-05): the tab reads the load-keyed driver-pay-detail model (self-consistent mileage
  // lines + settlement_lines accessorials). The old assertions here banned amount_cents/line_type and
  // required /driver-finance/driver-bills — all stale after LDT-3 (those fields are the legitimate
  // mileage/accessorial shape, and the endpoint is loads/:loadId/driver-pay-detail). Corrected to the
  // real endpoint the tab calls today.
  if (!/\/api\/v1\/driver-finance\/loads\/[^`'"]*driver-pay-detail/.test(src)) {
    errors.push("must call the load-keyed driver-pay-detail endpoint (LDT-3: /api/v1/driver-finance/loads/:loadId/driver-pay-detail)");
  }
  // LIVE 2026-08-18: EntityLink kind bill resolved driver_finance.driver_bills ids to
  // /accounting/bills/:id → bill_not_found (B-20260810-0003 / 31f155f3-…).
  // Ban JSX EntityLink props only (ignore prose comments).
  if (/<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/.test(src)) {
    errors.push("must not EntityLink kind=bill for driver_finance.driver_bills (AP bills are a different table)");
  }
  // REG-023(b) (owner 2026-09-10): the "Open driver bill" action must drill through kind="driver_bill"
  // (its own driver_finance route), never plain text.
  if (!/kind\s*=\s*["']driver_bill["']/.test(src)) {
    errors.push("the Open driver bill action must use EntityLink kind=driver_bill (its own route, REG-023b)");
  }
  return errors;
}

function checkSettlementsOpenBillsPanel() {
  const rel = "apps/frontend/src/pages/driver-finance/SettlementsPage.tsx";
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) {
    return [`missing ${rel}`];
  }
  const src = fs.readFileSync(abs, "utf8");
  if (/<EntityLink[\s\S]{0,200}?kind\s*=\s*["']bill["']/.test(src)) {
    return [`${rel} must not EntityLink kind=bill for open driver_finance.driver_bills rows`];
  }
  return [];
}

const ENTITYLINK = "apps/frontend/src/components/shared/EntityLink.tsx";

// REG-023(b) (owner 2026-09-10: "the Open Driver Bill button is unwired — no driver_bills/:id route
// exists"). The kind="driver_bill" EntityLink must resolve to the dedicated driver_finance driver-bill
// detail route (NEVER /accounting/bills/:id — a different table), the route must be registered, the
// page must reuse the canonical Driver Pay detail, and the read-only backend resolver must exist.
function checkReg023bDriverBillRoute() {
  const errors = [];

  const entity = read(ENTITYLINK);
  if (!/case "driver_bill":\s*\n\s*return `\/driver-finance\/driver-bills\/\$\{id\}`/.test(entity)) {
    errors.push("EntityLink resolveEntityRoute must route kind=driver_bill to /driver-finance/driver-bills/${id} (REG-023b)");
  }
  if (/case "driver_bill":\s*\n\s*return `\/accounting\/bills/.test(entity)) {
    errors.push("driver_bill must NEVER resolve to /accounting/bills/:id (different table — driver-finance-driver-bills-not-accounting-bills landmine)");
  }

  const manifest = read("apps/frontend/src/routes/manifest.tsx");
  if (!/path="\/driver-finance\/driver-bills\/:id"/.test(manifest)) {
    errors.push("routes/manifest.tsx must register the /driver-finance/driver-bills/:id Route (REG-023b)");
  }
  if (!/DriverBillDetailPage/.test(manifest)) {
    errors.push("routes/manifest.tsx must mount DriverBillDetailPage for the driver-bill detail route");
  }

  const page = "apps/frontend/src/pages/driver-finance/DriverBillDetailPage.tsx";
  if (!fs.existsSync(path.join(ROOT, page))) {
    errors.push(`missing ${page} (REG-023b driver-bill detail page)`);
  } else {
    const pageSrc = fs.readFileSync(path.join(ROOT, page), "utf8");
    if (!/LoadDetailDriverPayTab/.test(pageSrc)) {
      errors.push("DriverBillDetailPage must reuse the canonical LoadDetailDriverPayTab (one source of truth), not re-implement driver pay math");
    }
  }

  const backend = "apps/backend/src/driver-finance/driver-bills.routes.ts";
  const backendSrc = read(backend);
  if (!/app\.get\("\/api\/v1\/driver-finance\/driver-bills\/:id"/.test(backendSrc)) {
    errors.push("backend must expose read-only GET /api/v1/driver-finance/driver-bills/:id (REG-023b resolver)");
  }
  return errors;
}

function main() {
  const src = read(TARGET);
  const errors = [...check(src), ...checkSettlementsOpenBillsPanel(), ...checkReg023bDriverBillRoute()];
  if (errors.length) {
    console.error(`[${LABEL}] FAIL:\n  - ${errors.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS — Driver Pay tab maps driver_bills header fields`);
}

if (process.argv.includes("--selftest")) {
  const target = path.join(ROOT, TARGET);
  const origTarget = fs.readFileSync(target, "utf8");
  const entityAbs = path.join(ROOT, ENTITYLINK);
  const origEntity = fs.readFileSync(entityAbs, "utf8");
  // Plant 1: settlement-line field mapping — drops the required driver-bill header fields.
  const brokenFields = origTarget
    .replace(/gross_amount_cents/g, "xx_amount_cents")
    .replace(/bill_number/g, "xx_line_type");
  // Plant 2: AP bill EntityLink (LIVE bill_not_found class)
  const brokenBillKind = origTarget.replace(/kind="driver_bill"/g, 'kind="bill"');
  // Plant 3 (REG-023b): driver_bill EntityLink falls back to the wrong (AP bills) route.
  const brokenDriverBillRoute = origEntity.replace(
    "case \"driver_bill\":\n      return `/driver-finance/driver-bills/${id}`;",
    "case \"driver_bill\":\n      return `/accounting/bills/${id}`;"
  );
  for (const [label, file, broken] of [
    ["driver-bill header mapping", target, brokenFields],
    ["kind=bill AP drill", target, brokenBillKind],
    ["REG-023b driver_bill route", entityAbs, brokenDriverBillRoute],
  ]) {
    const orig = fs.readFileSync(file, "utf8");
    if (broken === orig) {
      console.error(`[${LABEL}] --selftest could not plant ${label}`);
      process.exit(1);
    }
    fs.writeFileSync(file, broken);
    try {
      const r = spawnSync(process.execPath, [fileURLToPath(import.meta.url)], {
        cwd: ROOT,
        encoding: "utf8",
      });
      if (r.status === 0) {
        console.error(`[${LABEL}] --selftest FAIL: planted ${label} still passed`);
        process.exit(1);
      }
      console.log(`[${LABEL}] --selftest PASS: planted ${label} failed closed`);
    } finally {
      fs.writeFileSync(file, orig);
    }
  }
  process.exit(0);
}

main();
