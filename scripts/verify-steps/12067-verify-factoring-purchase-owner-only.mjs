#!/usr/bin/env node
// ROUND 315 (FINAL) OWNER-ONLY LAW (owner, 2026-10-01 16:05Z): after the factoring clean slate (AUTH-193) "NO coder
// creates, closes or matches a purchase — the owner creates every purchase report himself in the app and matches each
// to its deposit." One gate (apps/backend/src/factoring/owner-only-purchase.ts) on every purchase write path; a refusal
// is a 403 plus one committed audit row (factoring.purchase_refused_non_owner).
//
// static: every file that INSERTs accounting.factoring_advances, every create/submit/advance/close route, and both
//         bank-match accept functions call the gate; auto-submit-on-delivery never creates a purchase.
// live (read-only): 0 factoring purchases created after the clean slate by an actor who is not the Owner.
import pg from "pg";
import { readFileSync, readdirSync, statSync } from "node:fs";
import path from "node:path";

const LABEL = "verify-factoring-purchase-owner-only";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const CLEAN_SLATE_AT = "2026-10-01T16:09:51Z"; // AUTH-193 audit b7b25e3d
const GATE = /requireFactoringPurchaseOwner|checkFactoringPurchaseOwner/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name);
    if (statSync(p).isDirectory()) {
      if (name === "__tests__" || name === "node_modules") continue;
      walk(p, out);
    } else if (/\.ts$/.test(name) && !/\.test\.ts$/.test(name)) out.push(p);
  }
  return out;
}

function selftest() {
  const problems = [];
  const backend = new URL("apps/backend/src/", ROOT).pathname;
  for (const f of walk(backend)) {
    const s = readFileSync(f, "utf8");
    if (!/INSERT INTO accounting\.factoring_advances/.test(s)) continue;
    const rel = path.relative(new URL(".", ROOT).pathname, f);
    if (rel.endsWith("factoring/auto-submit-on-delivery.service.ts")) continue; // checked below
    if (!GATE.test(s)) problems.push(`${rel} creates a purchase without the owner gate`);
  }

  const routes = read("apps/backend/src/accounting/factoring-advances.routes.ts");
  for (const action of ["create", "advance", "reserve_held", "release", "recourse_return"]) {
    if (!new RegExp(`requireFactoringPurchaseOwner\\(reply, client, \\{[^}]*action: "${action}"`, "s").test(routes)) {
      problems.push(`factoring-advances.routes.ts: ${action} route lacks the owner gate`);
    }
  }
  for (const f of ["apps/backend/src/factoring/batch.routes.ts", "apps/backend/src/factoring/submission-queue.routes.ts"]) {
    if (!/requireFactoringPurchaseOwner\(reply, client, \{[^}]*action: "create"/s.test(read(f))) problems.push(`${f}: submit lacks the owner gate`);
  }

  // ROUND 315 step 2 — the purchase document: every write route gates first, and the service re-checks the actor.
  const pr = read("apps/backend/src/factoring/purchase.routes.ts");
  for (const action of ["create", "advance", "release"]) {
    if (!new RegExp(`await ownerGate\\(reply, user, q\\.data\\.operating_company_id, "${action}"`).test(pr)) problems.push(`purchase.routes.ts: ${action} route lacks the owner gate`);
  }
  const ps = read("apps/backend/src/factoring/purchase.service.ts");
  if ((ps.match(/await assertOwnerActor\(client, oci, input\.actorUserId, "/g) ?? []).length < 3) problems.push("purchase.service.ts: create/post/void must each re-check the Owner actor");

  const match = read("apps/backend/src/accounting/bank-recon/match.service.ts");
  const gateCalls = match.match(/await assertOwnerMayMatchFactoringPurchase\(/g) ?? [];
  if (gateCalls.length < 2) problems.push(`match.service.ts: both accept functions must call assertOwnerMayMatchFactoringPurchase (found ${gateCalls.length})`);
  if (!/if \(!kinds\.includes\("factoring_advance"\)\) return;/.test(match)) problems.push("match gate must key on factoring_advance");
  const recon = read("apps/backend/src/accounting/bank-recon/recon-worklist.routes.ts");
  if ((recon.match(/error instanceof FactoringPurchaseOwnerOnlyError/g) ?? []).length < 3) problems.push("recon-worklist.routes.ts must map the refusal to 403 in every accept catch");

  const auto = read("apps/backend/src/factoring/auto-submit-on-delivery.service.ts");
  if (!/const FACTORING_PURCHASE_IS_OWNER_ONLY: boolean = true;/.test(auto) || !/if \(FACTORING_PURCHASE_IS_OWNER_ONLY\) return \{ submitted: false, reason: AUTO_SUBMIT_REFUSED_REASON \};/.test(auto)) {
    problems.push("auto-submit-on-delivery must refuse before any write");
  }

  const gate = read("apps/backend/src/factoring/owner-only-purchase.ts");
  if (!/if \(role === "Owner"\) return true;/.test(gate)) problems.push("gate must admit only the Owner role");
  if (!/factoring\.purchase_refused_non_owner/.test(gate) || !/reply\.code\(403\)/.test(gate)) problems.push("refusal must be 403 + audit row");

  if (problems.length) {
    console.error(`${LABEL} --selftest FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (static: insert sites, 7 routes, 3 purchase routes + service, 2 match paths, auto-submit, gate)`);
}

selftest();
if (process.argv.includes("--selftest")) process.exit(0);

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`${LABEL}: SKIP live — no DATABASE_URL (static PASS above)`);
  process.exit(0);
}
const client = new pg.Client({ connectionString: url, statement_timeout: 30000 });
await client.connect();
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const r = await client.query(
    `SELECT fa.display_id, u.role::text AS role
       FROM accounting.factoring_advances fa
       LEFT JOIN identity.users u ON u.id = fa.created_by_user_id
      WHERE fa.created_at > $1::timestamptz AND COALESCE(u.role::text, '') <> 'Owner'`,
    [CLEAN_SLATE_AT]
  );
  const total = (await client.query(`SELECT count(*)::int n FROM accounting.factoring_advances WHERE created_at > $1::timestamptz`, [CLEAN_SLATE_AT])).rows[0].n;
  await client.query("ROLLBACK");
  if (r.rows.length) {
    console.error(`${LABEL}: LIVE FAIL — ${r.rows.length} purchase(s) created after the clean slate by a non-Owner: ${r.rows.slice(0, 10).map((x) => `${x.display_id}(${x.role ?? "no user"})`).join(", ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${total} purchase(s) created since the clean slate, all by the Owner`);
} finally {
  await client.end();
}
