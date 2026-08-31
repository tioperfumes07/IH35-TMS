#!/usr/bin/env node
/**
 * RECON-CLOSED-SESSION-NO-AUTHORIZED-PATH (Codex found + honestly refused to route around,
 * 2026-09-01). closed-session-immutability.ts's "Transaction belongs to a closed reconciliation
 * session and cannot be mutated" was a genuine hard dead end for EVERY role, including the owner --
 * exactly the defect shape LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01 forbids. The
 * 'reopened' status value and the reopened_at/reopened_by_user_id/reopen_reason columns already
 * existed on banking.reconciliation_sessions (schema was fully ready); no route anywhere referenced
 * them. This guard locks the fix: reason required, RECON_ROLES (Owner/Administrator/Accountant --
 * NOT the narrower OWNER_ADMIN_ROLES void uses, since the law names Accountant explicitly),
 * 'reconciled' -> 'reopened' only (never 'voided' -- a closed period is reopened for correction, not
 * erased), audited with actor role + prior/new status + reason.
 *
 *   node scripts/verify-reconciliation-session-reopen-authorized-path.mjs
 *   node scripts/verify-reconciliation-session-reopen-authorized-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-reconciliation-session-reopen-authorized-path";
const FILE = "apps/backend/src/banking/reconciliation.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];

  if (!/"\/api\/v1\/banking\/reconciliation\/:sessionId\/reopen"/.test(src)) {
    errs.push(`${FILE}: the reopen route must exist — a hard dead end is the defect this closes`);
  }
  const blockMatch = src.match(/"\/api\/v1\/banking\/reconciliation\/:sessionId\/reopen"[\s\S]*?\n  \}\);/);
  const block = blockMatch ? blockMatch[0] : src;

  if (!/canReconcile\(user\.role\)/.test(block)) {
    errs.push(`${FILE}: reopen must check canReconcile (RECON_ROLES) — Owner/Administrator/Accountant, not the narrower void-only role set`);
  }
  if (!/const RECON_ROLES = new Set<ReconciliationRole>\(\["Owner", "Administrator", "Accountant"\]\)/.test(src)) {
    errs.push(`${FILE}: LAW — RECON_ROLES must include Accountant`);
  }
  const reopenSchemaMatch = src?.match(/const reopenBodySchema = z\.object\(\{[\s\S]*?\}\);/);
  const reopenSchema = reopenSchemaMatch ? reopenSchemaMatch[0] : "";
  if (!/reason:\s*z\.string\(\)[^;]*\.min\(1\)/.test(reopenSchema)) {
    errs.push(`${FILE}: reopenBodySchema must require a non-empty reason`);
  }
  if (!/status = 'reopened'/.test(block)) {
    errs.push(`${FILE}: reopen must set status = 'reopened', not any other value`);
  }
  if (/status = 'voided'/.test(block)) {
    errs.push(`${FILE}: reopen must never set status = 'voided' — a closed period is reopened for correction, not erased`);
  }
  if (!/AND status = 'reconciled'/.test(block)) {
    errs.push(`${FILE}: the UPDATE must be scoped to status = 'reconciled' only — cannot reopen an already-open/disputed/voided session through this path`);
  }
  if (!/reopened_at = now\(\)/.test(block) || !/reopened_by_user_id = \$3::uuid/.test(block) || !/reopen_reason = \$4/.test(block)) {
    errs.push(`${FILE}: must stamp reopened_at/reopened_by_user_id/reopen_reason — the columns exist, use them`);
  }
  if (!/appendCrudAudit\(/.test(block) || !/banking\.reconciliation\.reopened/.test(block)) {
    errs.push(`${FILE}: every reopen must be audited`);
  }
  if (!/reason:\s*body\.data\.reason/.test(block)) {
    errs.push(`${FILE}: the audit event must carry the caller's stated reason`);
  }
  if (!/actor_role:\s*user\.role/.test(block)) {
    errs.push(`${FILE}: the audit event must carry the actor's role, not just their id`);
  }

  return errs;
}

function selftest() {
  const good = read(FILE) ?? "";
  const goodErrs = assertGuard(good);
  if (goodErrs.length) {
    console.error(`${LABEL} --selftest FAIL good (${goodErrs.length}): ${goodErrs.join("; ")}`);
    process.exit(1);
  }

  const bad1 = assertGuard(good.replace('"/api/v1/banking/reconciliation/:sessionId/reopen"', '"/api/v1/banking/reconciliation/:sessionId/DISABLED-reopen"'));
  const bad2 = assertGuard(good.replace("if (!canReconcile(user.role)) {", "if (false) {"));
  const bad3 = assertGuard(good.replace(/reason:\s*z\.string\(\)\.trim\(\)\.min\(1\)\.max\(2000\),/, "reason: z.string().optional(),"));
  const bad4 = assertGuard(good.replace("status = 'reopened',", "status = 'voided',"));
  const bad5 = assertGuard(good.replace("AND status = 'reconciled'\n          RETURNING id", "RETURNING id"));
  const bad6 = assertGuard(good.replace(/await appendCrudAudit\(\s*client,\s*user\.uuid,\s*"banking\.reconciliation\.reopened"/, "// removed audit (\n        client,\n        user.uuid,\n        \"banking.reconciliation.reopened\""));

  for (const [name, res] of [
    ["bad1-route-removed", bad1],
    ["bad2-wrong-role-set", bad2],
    ["bad3-reason-optional", bad3],
    ["bad4-voids-instead-of-reopens", bad4],
    ["bad5-unscoped-update", bad5],
    ["bad6-no-audit", bad6],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 6/6 mutations caught`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const src = read(FILE);
const errs = assertGuard(src);
if (errs.length) {
  console.error(`[${LABEL}] FAILED — ${errs.length} issue(s):`);
  for (const e of errs) console.error(`  ✗ ${e}`);
  process.exit(1);
}
console.log(`[${LABEL}] OK — a closed reconciliation session has a real, role-gated, reasoned, audited reopen path`);
