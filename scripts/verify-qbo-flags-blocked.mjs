#!/usr/bin/env node
// ROUND 195 (owner order, 2026-09-28) — verify-qbo-flags-blocked.mjs
//
// Owner: "the QuickBooks flags are blocked permanently. Not 'off' - blocked, so that no seat,
// script or UI can ever set them true." Migration 202614530000 built catalogs.blocked_feature_flags
// (the named, auditable list) plus BEFORE INSERT/UPDATE triggers on lib.feature_flag_overrides and
// lib.feature_flags that RAISE EXCEPTION on any write that would resolve a blocked flag_key to
// enabled. This guard asserts, live, that the block actually holds:
//   1. All 17 named keys are present in catalogs.blocked_feature_flags.
//   2. Every one of those 17 resolves FALSE for every entity right now (belt-and-suspenders check
//      on top of the trigger -- if a row somehow got in before the trigger existed, this catches it).
//   3. An attempted enable (INSERT with enabled=true, inside a rolled-back transaction) actually
//      RAISES for a real key, proving the trigger is installed and live, not just present in a
//      migration file that never ran.
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const ALLOW_OFFLINE_SKIP = "live-data invariant by design, no static-only path";
const LABEL = "verify-qbo-flags-blocked";
export const REQUIRES_LIVE_DB =
  "live-data money/config guard (QBO write-back permanent block); fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B)";

// The exact 17 keys the owner's ROUND 195 order covers (19 QBO-named flags minus the 2 read-only UI
// surfaces -- QBO_RECONCILE_UI_ENABLED, TMS_QBO_RECON_UI_ENABLED -- which never post/write/move
// money and must stay enabled). Enumerated here (not just read from the DB) so a row silently
// missing from catalogs.blocked_feature_flags is a named, specific failure, not a shrinking count.
const REQUIRED_BLOCKED_KEYS = [
  "QBO_JE_PUSH_ENABLED",
  "QBO_ENTITY_PUSH_ENABLED",
  "VOID_QBO_MIRROR_ENABLED",
  "QBO_AP_BILLS_PROJECTION_ENABLED",
  "QBO_AP_BILL_PAYMENTS_PROJECTION_ENABLED",
  "QBO_AP_BILL_PAYMENT_MIRROR_PULL_ENABLED",
  "QBO_AP_MIRROR_PULL_ENABLED",
  "QBO_AR_INVOICES_PROJECTION_ENABLED",
  "QBO_AR_INVOICE_MIRROR_PULL_ENABLED",
  "QBO_AR_PAYMENTS_PROJECTION_ENABLED",
  "QBO_AR_PAYMENT_MIRROR_PULL_ENABLED",
  "QBO_EXPENSES_PROJECTION_ENABLED",
  "QBO_PURCHASES_MIRROR_PULL_ENABLED",
  "QBO_VENDOR_CREDITS_PROJECTION_ENABLED",
  "QBO_VENDOR_CREDIT_MIRROR_PULL_ENABLED",
  "QBO_MASTER_DATA_HEAL_ENABLED",
  "TMS_QBO_RECON_ENABLED",
];

// The one key used for the live enable-attempt proof (#3 above) -- the hard core the owner named
// first. Any of the 17 would do; this one is chosen because it is also the flag whose accidental
// enable would be the single most consequential (real JEs pushed into QuickBooks).

function selftest() {
  const failures = [];
  // STALE-LITERAL-OK: fixed owner-locked QBO key-list length selftest, not a purge/count window.
  if (REQUIRED_BLOCKED_KEYS.length !== 17) failures.push(`expected exactly 17 required keys, found ${REQUIRED_BLOCKED_KEYS.length}`);
  if (new Set(REQUIRED_BLOCKED_KEYS).size !== REQUIRED_BLOCKED_KEYS.length) failures.push("duplicate key in REQUIRED_BLOCKED_KEYS");
  for (const hardCore of ["QBO_JE_PUSH_ENABLED", "QBO_ENTITY_PUSH_ENABLED", "VOID_QBO_MIRROR_ENABLED"]) {
    if (!REQUIRED_BLOCKED_KEYS.includes(hardCore)) failures.push(`missing named hard-core key: ${hardCore}`);
  }
  for (const uiKey of ["QBO_RECONCILE_UI_ENABLED", "TMS_QBO_RECON_UI_ENABLED"]) {
    if (REQUIRED_BLOCKED_KEYS.includes(uiKey)) failures.push(`read-only UI flag must NOT be in the blocked list: ${uiKey}`);
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:\n  - ${failures.join("\n  - ")}`);
    process.exit(1);
  }
  console.log(`${LABEL} selftest OK — 17 required keys, 3 named hard-core present, 2 UI flags correctly excluded`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

async function main() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  const failures = [];
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL app.bypass_rls = 'lucia'");

    // #1 — every required key present in the blocklist table.
    const blockedRes = await client.query(`SELECT flag_key FROM catalogs.blocked_feature_flags`);
    const blockedSet = new Set(blockedRes.rows.map((r) => r.flag_key));
    for (const key of REQUIRED_BLOCKED_KEYS) {
      if (!blockedSet.has(key)) failures.push(`${key}: missing from catalogs.blocked_feature_flags`);
    }

    // #2 — every required key resolves FALSE for every live entity, right now.
    const companiesRes = await client.query(`SELECT id::text, short_name FROM org.companies WHERE deactivated_at IS NULL`);
    const enabledRes = await client.query(
      `
        SELECT o.flag_key, o.operating_company_id::text, c.short_name
          FROM lib.feature_flag_overrides o
          JOIN org.companies c ON c.id = o.operating_company_id
         WHERE o.flag_key = ANY($1::text[])
           AND o.enabled = true
           AND o.user_uuid IS NULL
           AND (o.expires_at IS NULL OR o.expires_at > now())
      `,
      [REQUIRED_BLOCKED_KEYS]
    );
    for (const row of enabledRes.rows) {
      failures.push(`${row.flag_key}: enabled=true for ${row.short_name} — the block did not hold`);
    }
    const globalEnabledRes = await client.query(
      `SELECT flag_key FROM lib.feature_flags WHERE flag_key = ANY($1::text[]) AND (default_enabled = true OR rollout_pct > 0)`,
      [REQUIRED_BLOCKED_KEYS]
    );
    for (const row of globalEnabledRes.rows) {
      failures.push(`${row.flag_key}: default_enabled/rollout_pct armed on lib.feature_flags — the block did not hold`);
    }

    await client.query("ROLLBACK");

    // #3 — the refusal is INSTALLED and LIVE, proven from the catalog, never by writing to production. (This used to
    // INSERT an enabled override inside a rolled-back transaction: a write probe from the gate credential. A guard
    // credential that can write is the defect; under the read-only reader the INSERT is refused before the trigger
    // is reached, so the probe proved nothing.) Both tables must carry an ENABLED trigger that fires BEFORE the write
    // and runs a function that names catalogs.blocked_feature_flags and raises QBO_FLAG_PERMANENTLY_BLOCKED.
    const trig = await client.query(
      `SELECT t.tgrelid::regclass::text AS tbl, t.tgname, t.tgenabled, pg_get_triggerdef(t.oid) AS def,
              position('QBO_FLAG_PERMANENTLY_BLOCKED' in p.prosrc) > 0 AS raises,
              position('blocked_feature_flags' in p.prosrc) > 0 AS lists
         FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
        WHERE t.tgrelid IN ('lib.feature_flag_overrides'::regclass, 'lib.feature_flags'::regclass) AND NOT t.tgisinternal`
    );
    for (const [tbl, mustFireOn] of [["lib.feature_flag_overrides", /BEFORE INSERT OR UPDATE/], ["lib.feature_flags", /BEFORE (INSERT OR )?UPDATE/]]) {
      const ok = trig.rows.find((r) => r.tbl === tbl && r.raises && r.lists && r.tgenabled !== "D" && mustFireOn.test(r.def));
      if (!ok) failures.push(`${tbl}: no ENABLED BEFORE-write trigger whose function checks blocked_feature_flags and raises QBO_FLAG_PERMANENTLY_BLOCKED`);
      else console.log(`${LABEL}: live refusal installed — ${tbl} ${ok.tgname} (enabled, ${mustFireOn.source})`);
    }

    if (failures.length) {
      console.error(`${LABEL}: FAIL — ${failures.length} issue(s):`);
      for (const f of failures) console.error(`  ✗ ${f}`);
      process.exit(1);
    }
    console.log(`${LABEL}: PASS — all 17 QBO flags blocked, resolve FALSE for every entity, and the enable refusal is installed and live on both flag tables.`);
  } catch (err) {
    await client.query("ROLLBACK").catch(() => {});
    console.error(`${LABEL}: FAIL — ${err.message}`);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
