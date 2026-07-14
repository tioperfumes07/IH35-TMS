#!/usr/bin/env node
/**
 * verify-wo-audit-entity-type.mjs
 *
 * ENT-AUDIT coverage guard for WORK ORDERS.
 *
 * The audit-history viewer (`EntityAuditHistoryTab`) mounts the WO Audit tab with
 * `entityType="work_order"`, and the backend list route
 * (apps/backend/src/audit/audit-events-list.routes.ts) filters events by an EXACT
 * match on BOTH `payload->>'entity_type'` AND `payload->>'entity_id'`. Loads set both
 * (entity_type:'load', entity_id:<id>) — so their events surface on the Load Audit tab.
 *
 * Work-order audit writers historically set only `resource_type`/`resource_id`, so WO
 * void/cancel/status-change/update events did NOT match the tab's filter and never
 * appeared. This guard asserts that EVERY WO audit writer (every `appendCrudAudit` call
 * emitting a `maintenance.wo.*` / `maintenance.work_order.*` event class) carries both
 * `entity_type: "work_order"` and an `entity_id` in its payload, so it can't regress.
 *
 * Checks run against COMMENT-STRIPPED text so a guard-describing comment can never
 * satisfy — or trip — a check. `--selftest` exercises assertGuard() against inline
 * fixtures (well-formed pass + each failure mode).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-wo-audit-entity-type";

// Every source file that emits work-order audit events via appendCrudAudit.
const WRITER_FILES = [
  "apps/backend/src/work-orders/work-orders.routes.ts",
  "apps/backend/src/governance/void-cancel-executors.ts",
];

// A WO audit event class literal, e.g. "maintenance.work_order.voided" or "maintenance.wo.created".
const WO_EVENT_CLASS_RE = /["'](maintenance\.(?:wo|work_order)\.[a-z_]+)["']/g;

// The payload metadata the ENT-AUDIT tab filter requires. entity_type MUST be exactly "work_order".
const ENTITY_TYPE_RE = /entity_type\s*:\s*["']work_order["']/;
const ENTITY_ID_RE = /entity_id\s*:/;

// How far past the event-class literal the payload object realistically extends.
const PAYLOAD_WINDOW = 700;

/** Strip // line comments and block comments so a guard-describing COMMENT can't satisfy a check. */
function stripComments(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

/**
 * Pure evaluation.
 * @param {Array<{ file: string, text: string }>} files
 * @returns {string[]} errors
 */
export function assertGuard(files) {
  const errors = [];
  let totalWriters = 0;

  for (const { file, text } of files) {
    const code = stripComments(text);
    let m;
    WO_EVENT_CLASS_RE.lastIndex = 0;
    while ((m = WO_EVENT_CLASS_RE.exec(code)) !== null) {
      totalWriters++;
      const eventClass = m[1];
      const window = code.slice(m.index, m.index + PAYLOAD_WINDOW);
      if (!ENTITY_TYPE_RE.test(window)) {
        errors.push(`${file}: WO audit writer for '${eventClass}' payload is missing entity_type: "work_order"`);
      }
      if (!ENTITY_ID_RE.test(window)) {
        errors.push(`${file}: WO audit writer for '${eventClass}' payload is missing entity_id`);
      }
    }
  }

  if (totalWriters === 0) {
    errors.push("no work-order audit writers found — WO_EVENT_CLASS_RE matched nothing (source moved?)");
  }

  return errors;
}

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return null;
  return fs.readFileSync(p, "utf8");
}

function selftest() {
  const goodWriter = `
    await appendCrudAudit(
      client,
      user.uuid,
      "maintenance.work_order.voided",
      {
        resource_type: "maintenance.work_orders",
        resource_id: wo.id,
        entity_type: "work_order",
        entity_id: wo.id,
        reason: parsed.data.reason,
      },
      "warning",
      "WO-VOID"
    );
    await appendCrudAudit(client, user.uuid, "maintenance.wo.created", { resource_id: wo.id, entity_type: "work_order", entity_id: wo.id, display_id: wo.display_id }, "info", "P6-T11179");
  `;

  const cases = [
    {
      name: "well-formed: both WO writers carry entity_type:'work_order' + entity_id → 0 errors",
      in: [{ file: "good.ts", text: goodWriter }],
      want: 0,
    },
    {
      name: "writer missing entity_type entirely → >=1 error",
      in: [{ file: "bad.ts", text: goodWriter.replace(/entity_type: "work_order",\s*/g, "") }],
      wantMin: 1,
    },
    {
      name: "wrong entity_type value ('workorder' not 'work_order') → >=1 error",
      in: [{ file: "bad.ts", text: goodWriter.replace(/entity_type: "work_order"/g, 'entity_type: "workorder"') }],
      wantMin: 1,
    },
    {
      name: "writer missing entity_id → >=1 error",
      in: [{ file: "bad.ts", text: goodWriter.replace(/entity_id: wo\.id,?/g, "") }],
      wantMin: 1,
    },
    {
      name: "a COMMENT mentioning entity_type does NOT satisfy a real writer",
      in: [{ file: "bad.ts", text: `// entity_type: "work_order" entity_id in the payload\n await appendCrudAudit(client, u, "maintenance.work_order.updated", { resource_id: wo.id }, "info", "X");` }],
      wantMin: 2,
    },
    {
      name: "no WO writers at all → 1 error (source moved)",
      in: [{ file: "empty.ts", text: "export const x = 1;" }],
      want: 1,
    },
  ];

  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.in).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.wantMin;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.name}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

const files = [];
for (const rel of WRITER_FILES) {
  const t = read(rel);
  if (t == null) {
    console.error(`[${LABEL}] FAILED — missing writer file ${rel}`);
    process.exit(1);
  }
  files.push({ file: rel, text: t });
}

const errors = assertGuard(files);
if (errors.length) {
  console.error(`[${LABEL}] FAILED — ${errors.length} issue(s):`);
  for (const e of errors) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — every work-order audit writer carries entity_type:"work_order" + entity_id so WO events surface on the ENT-AUDIT tab.`);
