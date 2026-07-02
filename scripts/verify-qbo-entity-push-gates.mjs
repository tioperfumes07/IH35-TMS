#!/usr/bin/env node
// verify:qbo-entity-push-gates — permanent guard (IMPORT-P0b).
//
// Under the parallel-books architecture (docs/specs/ACCOUNTING-ARCHITECTURE.md) TMS must not write entities
// (invoice/bill/customer/vendor/account/item) back to QuickBooks. Every outbox `tms-*-push.handler.ts`
// MUST consult the shared entity-push gate in deliver() BEFORE the QBO token fetch, and the gate module
// must keep its two layers. This guard fails the build if:
//   1. the gate module loses its LAYER-1 flag resolution or LAYER-2 origin refusal;
//   2. ANY tms-*-push.handler.ts (glob — future handlers auto-covered) does not call evaluateEntityPushGate;
//   3. in any handler the gate is not evaluated BEFORE the deliverQbo*Push call (token fetch);
//   4. a handler reintroduces the retired env-var money gate as its canHandle().

import { readdirSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const GATE = path.join(ROOT, "apps/backend/src/qbo/qbo-entity-push-gate.ts");
const HANDLER_DIR = path.join(ROOT, "apps/backend/src/outbox/handlers");
const HANDLER_RE = /^tms-.*-push\.handler\.ts$/;

const failures = [];
const read = (p) => {
  try {
    return readFileSync(p, "utf8");
  } catch {
    failures.push(`missing file: ${path.relative(ROOT, p)}`);
    return "";
  }
};

// 1. gate module keeps both layers
const gate = read(GATE);
if (gate) {
  if (!gate.includes("QBO_ENTITY_PUSH_ENABLED") || !/isEnabled\s*\(/.test(gate)) {
    failures.push("gate lost LAYER-1 flag resolution (isEnabled + QBO_ENTITY_PUSH_ENABLED)");
  }
  if (!/origin\s*!==\s*["']tms["']/.test(gate) || !gate.includes("import_source")) {
    failures.push("gate lost LAYER-2 origin refusal (origin !== 'tms' -> import_source)");
  }
}

// 2-4. every handler consults the gate, before the push, and doesn't reintroduce the env money-gate
const handlers = readdirSync(HANDLER_DIR).filter((f) => HANDLER_RE.test(f));
if (handlers.length < 6) {
  failures.push(`expected >=6 tms-*-push handlers, found ${handlers.length}`);
}
for (const file of handlers) {
  const src = read(path.join(HANDLER_DIR, file));
  if (!src) continue;
  const gateIdx = src.indexOf("evaluateEntityPushGate");
  if (gateIdx < 0) {
    failures.push(`${file}: does not consult evaluateEntityPushGate (ungated entity push)`);
    continue;
  }
  const pushIdx = src.search(/deliverQbo\w*Push\s*\(/);
  if (pushIdx >= 0 && gateIdx > pushIdx) {
    failures.push(`${file}: gate must be evaluated BEFORE the deliverQbo*Push token fetch`);
  }
  // the retired env-var money gate must not come back as canHandle's decision
  if (/canHandle\(\)\s*{[^}]*process\.env\.TMS_\w+_PUSH_HANDLER_ENABLED[^}]*!==\s*["']false["']/s.test(src)) {
    failures.push(`${file}: canHandle() still uses the retired env-var money gate — the gate is deliver()'s job`);
  }
}

if (failures.length > 0) {
  console.error("verify:qbo-entity-push-gates — FAILED");
  for (const f of failures) console.error(`  ✗ ${f}`);
  process.exit(1);
}
console.log(`verify:qbo-entity-push-gates — OK (${handlers.length} handlers gated, kill-switch intact)`);
