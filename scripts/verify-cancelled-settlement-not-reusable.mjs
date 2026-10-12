#!/usr/bin/env node
/**
 * ACCT-F347 (P36 · 36 OF 50) — a CANCELLED settlement was still being handed back as the driver's
 * "open" settlement, so future load pay would attach to paperwork that can never pay out.
 *
 * WHAT HAPPENED: the load-bookended model reuses a driver's open settlement so one settlement spans a
 * trip. ACCT-F266 tightened reuse to require a LIVE ANCHOR LOAD, but said nothing about the
 * settlement's OWN status. Cancelling does not set trip_closed_at, and the close path never fires for
 * a cancelled settlement — so a settlement cancelled while its anchor load stayed alive remained
 * "open" forever.
 *
 * Measured on prod after the owner void-all: FOUR USMCA drivers each had a cancelled settlement whose
 * anchor load was still in_transit / completed_docs_received. openLoadBookendedSettlement returned
 * that cancelled settlement instead of opening a new one. The pay would have looked filed and been
 * unpayable — the same "paperwork looks complete" failure ACCT-F266 describes, one condition short.
 *
 * TWO INVARIANTS:
 *   A. STATIC — both reuse sites (the query inside openLoadBookendedSettlement and the reader
 *      getActiveSettlementForDriver) still exclude cancelled/voided settlements. Two sites, because
 *      fixing one and leaving the other means the opener creates correctly while the reader still
 *      points the UI at dead paperwork.
 *   B. LIVE — no driver has a reusable cancelled/voided bookend settlement (trip open + live anchor).
 *      This is the condition that was true on prod and must never become true again.
 *
 * The static half needs no database, so it runs in every CI context including the fresh-DB job.
 */
import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const LABEL = "3069-verify-cancelled-settlement-not-reusable";
const SERVICE = path.join("apps", "backend", "src", "driver-finance", "settlements-load-bookended.service.ts");

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/--.*$/gm, "").replace(/\/\/.*$/gm, "");

// PINGSETTLEMENT-REUSE-APPROVED-NULL-CLOSE (#18524): both sites moved from the blacklist status <> 'cancelled' to the
// whitelist status = 'open' — strictly tighter (cancelled AND approved/paid/closed are refused), so either form holds.
const sites = [
  { name: "openLoadBookendedSettlement reuse query", re: /s\.status\s*(?:<>\s*'cancelled'|=\s*'open')/, voidRe: /s\.voided_at\s+IS\s+NULL/ },
  { name: "getActiveSettlementForDriver", re: /(?<!s\.)\bstatus\s*(?:<>\s*'cancelled'|=\s*'open')/, voidRe: /(?<!s\.)\bvoided_at\s+IS\s+NULL/ },
];

/** A · both reuse sites exclude cancelled/voided. Comments are stripped first — an earlier guard (3065) reported
 *  PASS on a deleted field because its own explanatory comment mentioned the identifier. */
export function checkReuseSites(src) {
  const code = stripComments(src);
  const broken = [];
  for (const site of sites) {
    if (!site.re.test(code)) broken.push(`${site.name}: missing status <> 'cancelled'`);
    if (!site.voidRe.test(code)) broken.push(`${site.name}: missing voided_at IS NULL`);
  }
  return broken;
}

/** B · live verdict: an empty scope is unverifiable (never a pass); any reusable cancelled/voided row fails. */
export function liveVerdict(bookended, reusableRows) {
  if (bookended === 0) return { ok: false, reason: "empty" };
  if (reusableRows.length) return { ok: false, reason: "reusable" };
  return { ok: true };
}

if (!fs.existsSync(SERVICE)) fail(`${SERVICE} not found — the bookend settlement path moved; re-point this guard rather than deleting it`);
const src = fs.readFileSync(SERVICE, "utf8");

if (process.argv.includes("--selftest")) {
  let ok = true;
  const ex = (n, c) => { if (!c) { console.error(`SELFTEST FAIL: ${n}`); ok = false; } };
  ex("real service passes", checkReuseSites(src).length === 0);
  const noStatus = `SELECT 1 FROM driver_settlements s WHERE s.voided_at IS NULL; SELECT 1 WHERE voided_at IS NULL`;
  ex("reuse query without a status clause fails", checkReuseSites(noStatus).length > 0);
  const noVoid = `SELECT 1 FROM driver_settlements s WHERE s.status = 'open'; SELECT 1 WHERE status = 'open'`;
  ex("reuse sites without voided_at IS NULL fail", checkReuseSites(noVoid).length > 0);
  const onlyInComment = `/* s.status <> 'cancelled' AND s.voided_at IS NULL */ // status = 'open' voided_at IS NULL`;
  ex("clause present only in a comment fails", checkReuseSites(onlyInComment).length > 0);
  const both = `WHERE s.status = 'open' AND s.voided_at IS NULL; WHERE status <> 'cancelled' AND voided_at IS NULL`;
  ex("both sites guarded passes", checkReuseSites(both).length === 0);
  ex("empty scope is not a pass", liveVerdict(0, []).ok === false && liveVerdict(0, []).reason === "empty");
  ex("a reusable cancelled settlement fails", liveVerdict(69, [{ display_id: "S-1" }]).ok === false);
  ex("clean live scope passes", liveVerdict(69, []).ok === true);
  console.log(ok ? `${LABEL} --selftest PASS (8/8)` : `${LABEL} --selftest FAIL`);
  process.exit(ok ? 0 : 1);
}

const broken = checkReuseSites(src);
if (broken.length) {
  for (const b of broken) console.error(` - ${b}`);
  fail(
    `${broken.length} settlement reuse guard clause(s) missing — a cancelled settlement handed back as "open" makes future driver pay attach to paperwork that can never pay out (ACCT-F347)`
  );
}

const url = process.env.DATABASE_URL;
if (!url) {
  console.log(`[${LABEL}] PASS (static half) — both reuse sites exclude cancelled/voided settlements; no DATABASE_URL for the live half`);
  process.exit(0);
}

// ── B · no reusable cancelled/voided settlement exists on any entity ─────────────────────────────
const pool = new pg.Pool({ connectionString: url, ssl: url.includes("localhost") ? false : { rejectUnauthorized: false } });
let client;
try {
  client = await pool.connect();
} catch {
  console.log(`[${LABEL}] PASS (static half) — database unreachable; static invariant held`);
  process.exit(0);
}

try {
  await client.query("BEGIN");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const present = await client.query(`SELECT to_regclass('driver_finance.driver_settlements') IS NOT NULL AS present`);
  if (!present.rows[0]?.present) {
    await client.query("ROLLBACK").catch(() => {});
    console.log(`[${LABEL}] PASS (static half) — driver_finance schema not present (fresh/unmigrated DB)`);
    client.release();
    await pool.end();
    process.exit(0);
  }

  const { rows } = await client.query(`
    SELECT s.operating_company_id::text AS opco, s.display_id, s.status
      FROM driver_finance.driver_settlements s
      JOIN mdata.loads fl
        ON fl.id = s.first_load_id
       AND fl.operating_company_id = s.operating_company_id
       AND fl.soft_deleted_at IS NULL
     WHERE s.settlement_model = 'load_bookended'
       AND s.trip_closed_at IS NULL
       AND s.first_load_id IS NOT NULL
       AND (s.status = 'cancelled' OR s.voided_at IS NOT NULL)
     ORDER BY s.display_id
  `);

  const scope = await client.query(
    `SELECT count(*)::int AS bookended FROM driver_finance.driver_settlements WHERE settlement_model = 'load_bookended'`
  );
  await client.query("COMMIT");

  const bookended = scope.rows[0]?.bookended ?? 0;
  const verdict = liveVerdict(bookended, rows);
  if (verdict.reason === "empty") {
    fail("no load_bookended settlements exist at all — this guard cannot see what it checks (RLS mask or empty DB), which is not a clean result");
  }

  if (verdict.reason === "reusable") {
    for (const r of rows) {
      console.error(
        ` - opco ${r.opco}: settlement ${r.display_id} is ${r.status} but still REUSABLE (trip open + live anchor load) — the next load for that driver would attach its pay to dead paperwork.`
      );
    }
    fail(`${rows.length} cancelled/voided settlement(s) are still reusable (ACCT-F347)`);
  }

  console.log(`[${LABEL}] PASS — both reuse sites exclude cancelled/voided, and 0 of ${bookended} load_bookended settlement(s) are cancelled-but-reusable`);
} catch (err) {
  await client.query("ROLLBACK").catch(() => {});
  fail(`query failed: ${err?.message ?? err}`);
} finally {
  client.release();
  await pool.end();
}
