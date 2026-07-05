#!/usr/bin/env node
/**
 * verify-legal-matters-role-gate
 *
 * Static guard for finding LEGAL-1. Legal Matters hold litigation evidence and MUST be role-gated on
 * every handler. This asserts that `apps/backend/src/legal/matters.routes.ts`:
 *   - calls `requireRole(...)` at least once per route registration (no handler left ungated), and
 *   - references both the read and write role allow-lists from the service.
 *
 * If a new legal-matters route is added without a `requireRole` gate, this fails.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import process from "node:process";

const ROOT = process.env.VERIFY_LEGAL_MATTERS_ROOT ?? process.cwd();
const FILE = join(ROOT, "apps/backend/src/legal/matters.routes.ts");

let text;
try {
  text = readFileSync(FILE, "utf8");
} catch {
  console.error(`✗ verify-legal-matters-role-gate: cannot read ${FILE}`);
  process.exit(1);
}

const failures = [];

// Count route registrations (app.get/post/put/patch/delete, generic form included).
const routeCount = (text.match(/\bapp\.(?:get|post|put|patch|delete)\b/g) ?? []).length;
// Count requireRole gate calls. The `reply,` comma form matches call sites
// (`requireRole(reply, role, [...])`) but NOT the helper definition (`requireRole(reply: FastifyReply`).
const gateCalls = (text.match(/\brequireRole\(reply,/g) ?? []).length;

if (routeCount === 0) {
  failures.push("no route registrations found — matcher may be stale");
}
if (gateCalls < routeCount) {
  failures.push(
    `only ${gateCalls} requireRole(reply, ...) gate call(s) for ${routeCount} route(s) — every handler must gate`
  );
}
if (!/LEGAL_MATTERS_READ_ROLES/.test(text)) {
  failures.push("missing LEGAL_MATTERS_READ_ROLES gate on read handlers");
}
if (!/LEGAL_MATTERS_MANAGE_ROLES/.test(text)) {
  failures.push("missing LEGAL_MATTERS_MANAGE_ROLES gate on write handlers");
}

if (failures.length > 0) {
  console.error("✗ verify-legal-matters-role-gate: FAIL");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}

console.log(
  `✓ verify-legal-matters-role-gate: all ${routeCount} legal-matters routes gated via requireRole (${gateCalls} gate calls).`
);
