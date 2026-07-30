#!/usr/bin/env node
/**
 * LST-PICKER-01 slice — CustomerDetail quality Reason picker must use ReferenceSelect with
 * createKind=customer_quality_event_reason (same-table write to catalogs.customer_quality_event_reasons).
 * Cursor even claim: 1786. Stacks on 1784 (entityScoped factory).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-lst-picker01-customer-quality-reason-inline-create";

const DETAIL = "apps/frontend/src/pages/CustomerDetail.tsx";
const REGISTRY = "apps/frontend/src/components/parity/catalogPickerRegistry.ts";
const ROUTES = "apps/backend/src/catalogs/generic-catalog.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function collectProblems() {
  const problems = [];
  const detail = read(DETAIL);
  const registry = read(REGISTRY);
  const routes = read(ROUTES);

  if (!detail) problems.push(`missing ${DETAIL}`);
  else {
    if (!/createKind=["']customer_quality_event_reason["']/.test(detail)) {
      problems.push(`${DETAIL}: quality Reason must use createKind=customer_quality_event_reason`);
    }
    // The quality Reason block must not be a bare Combobox without ReferenceSelect nearby.
    if (!/ReferenceSelect/.test(detail)) {
      problems.push(`${DETAIL}: must import/use ReferenceSelect for quality Reason`);
    }
  }

  if (!registry) problems.push(`missing ${REGISTRY}`);
  else {
    if (!/customer_quality_event_reason:\s*\{/.test(registry)) {
      problems.push(`${REGISTRY}: missing customer_quality_event_reason entry`);
    }
    if (!/writeTable:\s*"catalogs\.customer_quality_event_reasons"/.test(registry)) {
      problems.push(`${REGISTRY}: writeTable must be catalogs.customer_quality_event_reasons`);
    }
    if (!/\/api\/v1\/catalogs\/customers\/customer-quality-event-reasons/.test(registry)) {
      problems.push(`${REGISTRY}: must POST customers/customer-quality-event-reasons`);
    }
  }

  if (!routes) problems.push(`missing ${ROUTES}`);
  else if (!/customerQualityEventReasonsCatalogConfig[\s\S]{0,400}entityScoped:\s*true/.test(routes)) {
    problems.push(`${ROUTES}: customerQualityEventReasonsCatalogConfig must be entityScoped: true (1784)`);
  }

  return problems;
}

if (process.argv.includes("--selftest")) {
  const baseline = collectProblems();
  if (baseline.length) {
    console.error(`${LABEL} SELFTEST FAIL:`);
    for (const p of baseline) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST OK`);
} else {
  const problems = collectProblems();
  if (problems.length) {
    console.error(`${LABEL} FAIL:`);
    for (const p of problems) console.error("  - " + p);
    process.exit(1);
  }
  console.log(`${LABEL} OK — CustomerDetail quality Reason inline create`);
}
