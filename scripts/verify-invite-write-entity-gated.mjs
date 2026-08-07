#!/usr/bin/env node
/**
 * MDATA-F07 class — a route that writes an INVITE must prove the caller belongs to the invited
 * driver's company BEFORE the write.
 *
 * WHY THIS GUARD EXISTS, when verify-company-membership-assert already covers "membership asserts":
 * that guard is OPT-IN BY IMPORT. Its own summary says it checks "auto-discovered HELPER-CONSUMING
 * tenant-scope files" — a file is only in scope once it already imports the membership helper. A route
 * with ZERO asserts, which is exactly the vulnerable state, is invisible to it. Proven on this repo:
 * with MDATA-F07 fully live on main (`POST /api/v1/mdata/drivers/:id/resend-invite` resolving the
 * driver with `WHERE d.id = $1`, no entity predicate, then sending a REAL email), that guard exited 0.
 * A control that passes on the unfixed code is not a control.
 *
 * So this guard keys on the SIDE EFFECT, not on the import: every `INSERT INTO identity.driver_invites`
 * is an outbound invite to a real person. Each one must be preceded, inside its own enclosing handler,
 * by `assertCompanyMembership(` — or carry an explicit `invite-entity-gate-exempt:` comment stating why
 * the company is already provably the caller's.
 *
 * Two live leaks were found by writing it:
 *   MDATA-F07  resend-invite    — looked the driver up by id ALONE; company A could email company B's driver.
 *   bulk-invite                 — checked isOwnerOrAdmin (a ROLE, not a company) and took
 *                                 operating_company_id from the REQUEST BODY, so an Owner in A could
 *                                 mass-invite every driver in B.
 * RLS is not a backstop for either: org.user_accessible_company_ids() returns EVERY active company for
 * an Owner (PERMANENT LAW 4), so an entity predicate built from caller-supplied input authorizes nothing.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const WRITE_RE = /INSERT\s+INTO\s+identity\.driver_invites/gi;
const ASSERT = "assertCompanyMembership(";
const EXEMPT = "invite-entity-gate-exempt:";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else if (/\.ts$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/**
 * Start of the handler enclosing `index`: the nearest preceding route registration or function
 * declaration. Scoping to the handler (not the file) is deliberate — a membership assert in a
 * DIFFERENT route in the same file must not launder an ungated one.
 */
function handlerStart(src, index) {
  const re = /(?:app\.(?:get|post|put|patch|delete)\s*\(|export\s+async\s+function\s+\w+|^async\s+function\s+\w+)/gm;
  let start = 0;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (m.index >= index) break;
    start = m.index;
  }
  return start;
}

export function auditSource(src, label) {
  const problems = [];
  for (const m of src.matchAll(WRITE_RE)) {
    const scope = src.slice(handlerStart(src, m.index), m.index);
    if (scope.includes(ASSERT) || scope.includes(EXEMPT)) continue;
    const line = src.slice(0, m.index).split("\n").length;
    problems.push(
      `${label}:${line}: writes identity.driver_invites with no ${ASSERT.slice(0, -1)} and no "${EXEMPT}" reason in the enclosing handler — an invite is a real message to a real person, so the caller's membership in that driver's company must be proven BEFORE the write (MDATA-F07).`,
    );
  }
  return problems;
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["gated: assert before the insert", `app.post("/x", async (req) => { await assertCompanyMembership(c, u, id); await c.query(\`INSERT INTO identity.driver_invites (a) VALUES (1)\`); });`, 0],
    ["MDATA-F07 shape: no assert at all", `app.post("/x", async (req) => { await c.query(\`INSERT INTO identity.driver_invites (a) VALUES (1)\`); });`, 1],
    ["explicitly exempted with a reason", `app.post("/x", async (req) => { /* invite-entity-gate-exempt: company came from user_accessible_company_ids */ await c.query(\`INSERT INTO identity.driver_invites (a) VALUES (1)\`); });`, 0],
    ["laundering: assert lives in a DIFFERENT route in the same file", `app.post("/a", async () => { await assertCompanyMembership(c, u, id); });\napp.post("/b", async () => { await c.query(\`INSERT INTO identity.driver_invites (a) VALUES (1)\`); });`, 1],
    ["assert AFTER the write is too late", `app.post("/x", async () => { await c.query(\`INSERT INTO identity.driver_invites (a) VALUES (1)\`); await assertCompanyMembership(c, u, id); });`, 1],
    ["file with no invite write", `app.post("/x", async () => { await c.query("SELECT 1"); });`, 0],
    ["case/whitespace variation still matched", `app.post("/x", async () => { await c.query(\`insert   into   identity.driver_invites (a) VALUES (1)\`); });`, 1],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = auditSource(src, "t.ts").length;
    if (got !== expect) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect}, got ${got}`); }
  }
  if (bad) { console.error(`verify-invite-write-entity-gated --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`verify-invite-write-entity-gated --selftest: ${cases.length} cases pass`);
  process.exit(0);
}

const offenders = [];
for (const f of walk(SRC)) {
  const src = readFileSync(f, "utf8");
  if (!/identity\.driver_invites/i.test(src)) continue;
  offenders.push(...auditSource(src, relative(ROOT, f)));
}

if (offenders.length) {
  console.error("FAIL verify-invite-write-entity-gated — ungated invite write (MDATA-F07 class):");
  for (const o of offenders) console.error(`  · ${o}`);
  process.exit(1);
}
console.log("verify-invite-write-entity-gated: OK — every identity.driver_invites write is membership-asserted or exempt-with-reason");
