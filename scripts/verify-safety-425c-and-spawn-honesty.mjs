#!/usr/bin/env node
/**
 * verify-safety-425c-and-spawn-honesty (SAF-425C-PHANTOM + SAF-B30)
 *
 * TWO DEFECTS, ONE THEME: a safety surface that produced a record implying something happened when it
 * did not. Both prod-verified on br-fancy-credit-akjnd07a 2026-07-27.
 *
 * 1. SAF-425C-PHANTOM — safety/audit-425c.routes.ts selected `id` and `emitted_at` from
 *    audit.audit_events. That table has NEITHER: its columns are uuid, created_at, event_class,
 *    severity, payload, actor_user_uuid, source — exactly as docs/CLAUDE.md §8 documents them, so the
 *    documentation was right and the code was wrong. Every call threw 42703, which means the Form
 *    425C Chapter 11 DIP audit trail — the report a bankruptcy court reads — returned nothing but an
 *    error, over a table holding 629,214 rows of which 228,953 belong to TRANSP. The corrected query
 *    was executed read-only against prod and returns 500 rows.
 *
 * 2. SAF-B30 — safety/accidents/:id/spawn-liability wrote an audit event named
 *    "safety.accident.spawn_liability" and returned { spawned_liability_id: null }, creating NOTHING.
 *    driver_finance.driver_liabilities has 0 rows on prod, confirming none was ever created. That is
 *    worse than a no-op: it left a permanent audit record asserting a liability was spawned. In an
 *    insurance or liability dispute that record is a false statement of fact. It now REFUSES with 501
 *    and records the refusal, because the recovery amount is owner-locked economics (escrow first,
 *    shortfall to Driver Damage Loss) and defaulting it would put a fabricated debt on a driver.
 *
 * Usage: node scripts/verify-safety-425c-and-spawn-honesty.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

const AUDIT_425C = "apps/backend/src/safety/audit-425c.routes.ts";
const SAFETY_ROUTES = "apps/backend/src/safety/safety.routes.ts";

export function strip(text) {
  return text.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/--[^\n]*/g, " ").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

export function audit425cProblems(src) {
  const out = [];
  // Flag emitted_at ONLY as a real column read. `created_at AS emitted_at` is the CORRECT fix — the
  // API keeps its response field name while reading the column that exists — so an alias must not
  // trip this. Lookbehind excludes the alias form; ORDER BY is checked separately since an alias
  // cannot appear there.
  if (/\bemitted_at\s+DESC/i.test(src) || /SELECT[^;]*(?<!AS )\bemitted_at\b/i.test(src)) {
    out.push("audit-425c still reads emitted_at from audit.audit_events — that column does not exist (it is created_at); this throws 42703 on the Chapter 11 DIP audit trail");
  }
  if (/SELECT\s+id\s*,/i.test(src)) {
    out.push("audit-425c still selects a bare `id` from audit.audit_events — the primary key column is uuid");
  }
  if (!/created_at/.test(src)) {
    out.push("audit-425c no longer references created_at — the real timestamp column on audit.audit_events");
  }
  return out;
}

export function spawnLiabilityProblems(src) {
  const out = [];
  // The dishonest shape: an audit event claiming the spawn happened, alongside a null result.
  if (/"safety\.accident\.spawn_liability"/.test(src)) {
    out.push('spawn-liability still writes the audit event "safety.accident.spawn_liability" — it creates no liability, so that record asserts something that did not happen (use spawn_liability_refused)');
  }
  if (!/E_LIABILITY_SPAWN_NOT_IMPLEMENTED/.test(src)) {
    out.push("spawn-liability does not refuse explicitly — an endpoint that creates nothing must say so, not return a null id as if it succeeded");
  }
  return out;
}

function read(p) {
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${p} not found — if it moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return strip(readFileSync(abs, "utf8"));
}

function run() {
  const problems = [...audit425cProblems(read(AUDIT_425C)), ...spawnLiabilityProblems(read(SAFETY_ROUTES))];
  if (problems.length) {
    console.error(`[verify-safety-425c-and-spawn-honesty] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log("[verify-safety-425c-and-spawn-honesty] OK — 425C reads real columns; spawn-liability refuses honestly instead of implying a record it never created");
  return true;
}

function selftest() {
  let ok = true;
  const a = read(AUDIT_425C);
  const s = read(SAFETY_ROUTES);

  if (audit425cProblems(a).length || spawnLiabilityProblems(s).length) {
    console.error("SELFTEST FAIL: the real (fixed) sources are flagged — false positive");
    ok = false;
  } else {
    console.log("SELFTEST: corrected sources not flagged — OK");
  }

  const cases = [
    ["425C emitted_at restored", audit425cProblems("SELECT uuid, payload, emitted_at FROM audit.audit_events ORDER BY emitted_at DESC"), true],
    ["425C bare id restored", audit425cProblems("SELECT id, event_class FROM audit.audit_events ORDER BY created_at DESC"), true],
    ["425C corrected shape", audit425cProblems("SELECT uuid AS id, payload, created_at AS emitted_at FROM audit.audit_events ORDER BY created_at DESC"), false],
    ["spawn success-audit restored", spawnLiabilityProblems('await appendCrudAudit(c,u,"safety.accident.spawn_liability",{}); return { spawned_liability_id: null };'), true],
    ["spawn refusal shape", spawnLiabilityProblems('error: "E_LIABILITY_SPAWN_NOT_IMPLEMENTED"'), false],
  ];
  for (const [name, problems, shouldFlag] of cases) {
    const flagged = problems.length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }
  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
