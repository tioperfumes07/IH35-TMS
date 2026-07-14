#!/usr/bin/env node
/**
 * ENT-AUDIT all-entity-types guard.
 *
 * Locked-sequence item 5 (ENT-AUDIT) mounted the shared EntityAuditHistoryTab — previously wired
 * only on the unit/vehicle profile (VehicleProfilePage) — onto the five remaining first-class entity
 * detail pages: driver, customer, vendor, load, and work-order. The shared viewer is what carries
 * the QBO-parity filter bar (from/to, event type, actor, status, source, voids-only) + CSV export,
 * so every entity's audit trail is read through one component keyed on the audit spine's short
 * entity_type string (payload->>'entity_type' — 'driver' | 'customer' | 'vendor' | 'load' |
 * 'work_order', matching 'unit' on the vehicle page — NOT the schema-qualified 'mdata.*' form).
 *
 * Lock: each of the five pages must keep BOTH (a) the EntityAuditHistoryTab import and (b) a render
 * with the correct entityType literal, so a future refactor can't silently drop the tab or repoint
 * it to the wrong entity_type (which would make the viewer query the wrong / no rows).
 *
 * --selftest exercises assertGuard() against inline good/bad fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ent-audit-all-entity-types";

const IMPORT_RE = /import\s*\{[^}]*\bEntityAuditHistoryTab\b[^}]*\}\s*from\s*["'][^"']*\/audit\/EntityAuditHistoryTab["']/;

const TARGETS = [
  { file: "apps/frontend/src/pages/drivers/DriverProfilePage.tsx", entityType: "driver" },
  { file: "apps/frontend/src/pages/CustomerDetail.tsx", entityType: "customer" },
  { file: "apps/frontend/src/pages/VendorDetail.tsx", entityType: "vendor" },
  { file: "apps/frontend/src/components/dispatch/LoadDetailDrawer.tsx", entityType: "load" },
  { file: "apps/frontend/src/pages/maintenance/WorkOrderDetailPage.tsx", entityType: "work_order" },
];

/** Strip block + line comments so explanatory prose naming the tokens is never matched. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export function assertGuard({ file, source, entityType }) {
  const errors = [];
  const code = stripComments(source);
  if (!IMPORT_RE.test(code)) {
    errors.push(`${file}: missing import of EntityAuditHistoryTab from a .../audit/EntityAuditHistoryTab module`);
  }
  if (!/<EntityAuditHistoryTab\b/.test(code)) {
    errors.push(`${file}: EntityAuditHistoryTab is imported but never rendered`);
  }
  // The render must key on this page's entity_type (matches audit spine payload->>'entity_type').
  const typeRe = new RegExp(`entityType=(?:\\{)?["']${entityType}["']`);
  if (!typeRe.test(code)) {
    errors.push(`${file}: EntityAuditHistoryTab render missing entityType="${entityType}"`);
  }
  return errors;
}

function selftest() {
  const good = (t) =>
    `import { EntityAuditHistoryTab } from "../components/audit/EntityAuditHistoryTab";\n` +
    `<EntityAuditHistoryTab operatingCompanyId={companyId} entityType="${t}" entityId={id} />`;
  const cases = [
    { n: "driver good → 0", args: { file: "d", source: good("driver"), entityType: "driver" }, want: 0 },
    { n: "customer good → 0", args: { file: "c", source: good("customer"), entityType: "customer" }, want: 0 },
    { n: "vendor good → 0", args: { file: "v", source: good("vendor"), entityType: "vendor" }, want: 0 },
    { n: "load good → 0", args: { file: "l", source: good("load"), entityType: "load" }, want: 0 },
    { n: "work_order good → 0", args: { file: "w", source: good("work_order"), entityType: "work_order" }, want: 0 },
    {
      n: "missing import",
      args: { file: "x", source: `<EntityAuditHistoryTab entityType="driver" />`, entityType: "driver" },
      min: 1,
    },
    {
      n: "imported but not rendered",
      args: { file: "x", source: `import { EntityAuditHistoryTab } from "../components/audit/EntityAuditHistoryTab";`, entityType: "driver" },
      min: 1,
    },
    {
      n: "wrong entity_type (mdata.* form rejected)",
      args: { file: "x", source: good("mdata.drivers"), entityType: "driver" },
      min: 1,
    },
    {
      n: "import only inside a comment → treated as missing",
      args: { file: "x", source: `// import { EntityAuditHistoryTab } from "../components/audit/EntityAuditHistoryTab";\n<EntityAuditHistoryTab entityType="driver" />`, entityType: "driver" },
      min: 1,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.args).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

let total = 0;
for (const t of TARGETS) {
  const p = path.join(ROOT, t.file);
  if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${t.file}`); process.exit(1); }
  const errors = assertGuard({ file: t.file, source: fs.readFileSync(p, "utf8"), entityType: t.entityType });
  for (const e of errors) console.error(`  ✗ ${e}`);
  total += errors.length;
}
if (total) { console.error(`[${LABEL}] FAILED — ${total} issue(s).`); process.exit(1); }
console.log(`[${LABEL}] OK — EntityAuditHistoryTab mounted on driver/customer/vendor/load/work-order with correct entity_type literals.`);
