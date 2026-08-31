#!/usr/bin/env node
/**
 * LAW-EDITABLE-BY-PERMISSION-ALWAYS-TRACEABLE-2026-09-01 — "a hard 'cannot be mutated' with no
 * authorized path is a DEFECT, not a safety feature." driver-subaccount-backfill.routes.ts used to
 * expose ONLY a dry-run; the write (apply=true) had no route at all, so the owner's own STOP-DECISION
 * #2 go had no reachable, click-driven UI/API surface — a hard dead end for the exact 73/94-driver
 * gap this whole invariant exists to close. This guard locks the shape the law requires for the new
 * apply route: role-gated to Owner/Administrator/Accountant, requires an explicit typed confirmation
 * (never a bare boolean the client could default-true), requires a stated reason, reuses the SAME
 * idempotent service the dry-run route already calls (no duplicated/new GL or account-creation SQL
 * in the route itself), and writes its own top-level audit event (actor, role, reason, counts) in
 * addition to the per-account audit rows the shared provisioners already emit.
 *
 *   node scripts/verify-driver-subaccount-backfill-apply-authorized-path.mjs
 *   node scripts/verify-driver-subaccount-backfill-apply-authorized-path.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-driver-subaccount-backfill-apply-authorized-path";
const FILE = "apps/backend/src/accounting/driver-subaccount-backfill.routes.ts";

function read(rel) {
  const p = path.join(ROOT, rel);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

export function assertGuard(src) {
  const errs = [];
  if (!src) return [`${FILE}: missing`];

  if (!/app\.post\(\s*"\/api\/v1\/payroll\/driver-subaccount-backfill\/apply"/.test(src)) {
    errs.push(`${FILE}: the apply route must exist — a hard 'cannot be mutated' dead end is the defect this fix closes`);
  }
  if (!/confirm:\s*z\.literal\(true\)/.test(src)) {
    errs.push(`${FILE}: apply body must require confirm: z.literal(true), not a bare boolean the client could default`);
  }
  if (!/reason:\s*z\.string\(\)[^;]*\.min\(1\)/.test(src)) {
    errs.push(`${FILE}: apply body must require a non-empty reason — LAW: every edit is traceable to why`);
  }
  const applyBlockMatch = src.match(/app\.post\(\s*"\/api\/v1\/payroll\/driver-subaccount-backfill\/apply"[\s\S]*?\n\s*\}\s*\);?\s*$/m);
  const applyBlock = applyBlockMatch ? applyBlockMatch[0] : src;
  if (!/const APPLY_ROLES\s*=\s*new Set\(/.test(src)) {
    errs.push(`${FILE}: APPLY_ROLES allowlist declaration is missing`);
  }
  if (!/APPLY_ROLES\.has\(role\)/.test(applyBlock) && !/APPLY_ROLES\.has\(/.test(src)) {
    errs.push(`${FILE}: apply route must check a role allowlist before writing`);
  }
  if (!/"Owner"/.test(src) || !/"Accountant"/.test(src)) {
    errs.push(`${FILE}: LAW — Owner and Accountant must always be in the authorized role set`);
  }
  if (!/runDriverSubAccountBackfill\(/.test(src)) {
    errs.push(`${FILE}: apply route must reuse runDriverSubAccountBackfill — never invent new account-creation SQL`);
  }
  if (!/apply:\s*true/.test(src)) {
    errs.push(`${FILE}: apply route must actually pass apply: true through to the service (else it's a fake write)`);
  }
  if (!/appendCrudAudit\(/.test(src) || !/subaccount_backfill\.applied/.test(src)) {
    errs.push(`${FILE}: apply route must write its own top-level audit event naming who/when/why/counts`);
  }
  if (!/reason:\s*body\.data\.reason/.test(src)) {
    errs.push(`${FILE}: the audit event must carry the caller's stated reason, not omit it`);
  }

  // The dry-run route must still exist and still never write.
  if (!/apply:\s*false/.test(src)) {
    errs.push(`${FILE}: the dry-run route must still hard-code apply: false — it must never write`);
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

  const bad1 = assertGuard(good.replace('confirm: z.literal(true),', ""));
  const bad2 = assertGuard(good.replace(/reason:\s*z\.string\(\)[^;]*\.min\(1\)[^;]*;/, "reason: z.string().optional(),"));
  const bad3 = assertGuard(good.replace(/const APPLY_ROLES = new Set\(\[[^\]]*\]\);/, ""));
  const bad4 = assertGuard(good.replace(/appendCrudAudit\(/, "// removed audit ("));
  const bad5 = assertGuard(good.replace("apply: true,", "apply: false, // BUG: fake write"));

  for (const [name, res] of [
    ["bad1-no-typed-confirm", bad1],
    ["bad2-reason-optional", bad2],
    ["bad3-no-role-allowlist", bad3],
    ["bad4-no-audit", bad4],
    ["bad5-fake-write", bad5],
  ]) {
    if (res.length === 0) {
      console.error(`${LABEL} --selftest FAIL ${name}: mutation not caught`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS 5/5 mutations caught`);
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
console.log(`[${LABEL}] OK — the driver-subaccount backfill apply path is reachable, role-gated, confirmed, reasoned, and audited`);
