#!/usr/bin/env node
// ROUND 155.18 — asserts accounting.refuse_financial_row_delete() carries no role-based carve-out.
// The first draft of this fix only refused DELETE when current_user = 'ih35_app', which meant
// neondb_owner (and any other role) bypassed WORM entirely, unaudited. This guard reads the LIVE
// function body from prod (pg_get_functiondef) and fails if it finds a current_user / pg_has_role /
// SESSION_USER check gating the refusal -- the only conditional logic allowed in the function is the
// app.purge_auth_id + voided_at check, which applies identically regardless of role.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-worm-applies-to-every-role";
const roleCarveOutPattern = /current_user\s*(<>|!=|=)\s*'[a-z0-9_]+'|pg_has_role\s*\(|session_user\s*(<>|!=|=)/i;

function checkFunctionDef(def) {
  const match = def.match(roleCarveOutPattern);
  if (match) {
    return { ok: false, reason: `role carve-out found: "${match[0]}"` };
  }
  if (!def.includes("purge_auth_id")) {
    return { ok: false, reason: "no app.purge_auth_id gate found" };
  }
  return { ok: true };
}

function selftest() {
  const badDef = `BEGIN\n IF current_user <> 'ih35_app' THEN\n   RETURN OLD;\n END IF;\nEND`;
  const goodDef = `BEGIN\n v_auth_id := current_setting('app.purge_auth_id', true);\n IF v_auth_id ~ '^AUTH-[0-9]+$' THEN RETURN OLD; END IF;\nEND`;
  const noGateDef = `BEGIN\n RAISE EXCEPTION 'nope';\nEND`;

  const bad = checkFunctionDef(badDef);
  const good = checkFunctionDef(goodDef);
  const noGate = checkFunctionDef(noGateDef);

  const failures = [];
  if (bad.ok) failures.push("selftest: role carve-out def should have FAILED but PASSED");
  if (!good.ok) failures.push(`selftest: hardened def should have PASSED but FAILED (${good.reason})`);
  if (noGate.ok) failures.push("selftest: no-gate def should have FAILED but PASSED");

  if (failures.length > 0) {
    console.error("verify-worm-applies-to-every-role --selftest FAIL:");
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log("verify-worm-applies-to-every-role --selftest PASS (3 checks: role-carve-out detected, hardened-gate accepted, no-gate detected)");
}

async function main() {
  if (process.argv.includes("--selftest")) {
    selftest();
    return;
  }
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const r = await client.query(`
    SELECT pg_get_functiondef(p.oid) AS def
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'accounting' AND p.proname = 'refuse_financial_row_delete'
  `);
  client.release();
  await pool.end();

  if (r.rows.length === 0) {
    console.log("verify-worm-applies-to-every-role FAIL — accounting.refuse_financial_row_delete() does not exist");
    process.exit(1);
  }

  const result = checkFunctionDef(r.rows[0].def);
  if (!result.ok) {
    console.log(`verify-worm-applies-to-every-role FAIL — accounting.refuse_financial_row_delete(): ${result.reason}. WORM must apply to every role with no exemption.`);
    process.exit(1);
  }

  console.log("verify-worm-applies-to-every-role PASS — no role carve-out in accounting.refuse_financial_row_delete(); the only bypass is the app.purge_auth_id gate, which applies to every role identically.");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
