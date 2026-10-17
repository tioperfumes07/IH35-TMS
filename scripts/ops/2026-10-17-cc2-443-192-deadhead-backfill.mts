// LEAD 443.192 (ruling 12:15Z): fill the NULL deadhead of the 19 USMCA loads booked 2026-10-16 that are on NO live driver
// settlement, through the ONE deadhead engine the audited POST /api/v1/mdata/loads/deadhead-fill calls
// (fillLoadDeadhead, apps/backend/src/dispatch/mileage/miles-recommendations.service.ts — 7c78986aaa, RULING 443.86 #1),
// owner actor like the other restamp runners. Only miles_deadhead / its method / miles_choice.empty are written — loaded
// miles, pay and invoice amounts are untouched; a document or user value is never replaced. A load the engine cannot
// compute (needs the owner's practical-miles choice, no previous load, no stop coordinates, no Google route) is SKIPPED
// and listed with the engine's reason. The 5 loads on live settlements and the 4 cancelled loads are NOT in the list.
//
// Each load is RE-CHECKED before it is touched: live, not cancelled/voided, deadhead still NULL, on NO live
// (non-cancelled) settlement — neither a settlement line nor a driver bill settled into one. Any failure -> refused.
//
//   default DRY RUN: SELECT-only. The engine runs on a recording client — every write it issues (UPDATE / INSERT /
//     audit.append_event) is captured and NOT sent; SELECT ... FOR UPDATE is sent as a plain SELECT. Google is called
//     only when GOOGLE_PLACES_API_KEY + GOOGLE_PLACES_ENABLED=true are set; otherwise an uncached leg is reported as
//     NEEDS GOOGLE (from -> to). Runs under the read-only gate credential.
//   --fork-commit (assertNotProduction) · --apply --auth AUTH-NNN | OWNER-ORDER-443.192 (prod, assertIsIntendedProduction):
//     one savepoint per load; read-back of miles_deadhead / method / miles_choice.empty and the dispatch.load.deadhead_filled
//     audit row; refuses the whole run if any journal posting changed (postings hash) or the trial balance moved.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { fillLoadDeadhead } from "../../apps/backend/src/dispatch/mileage/miles-recommendations.service.ts";
import { computeRouteReference } from "../../apps/backend/src/integrations/google/routes-api-client.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// Lead 12:15Z: the 8 dispatched + the 11 invoiced/closed, all on no live settlement (prod read-only, 2026-10-17).
const LOAD_NUMBERS = [
  "13666", "13675", "13676", "13677", "13678", "13681", "13682", "13683",
  "13544", "13563", "13656", "13661", "13663", "13667", "13668", "13672", "13673", "13674", "13680",
];
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
let auth = "";
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  auth = i > 0 ? process.argv[i + 1] ?? "" : "";
  // Lead 443.192 12:15Z carries the owner's order; --auth OWNER-ORDER-443.192 records it; any AUTH-NNN still goes through
  // verify-owner-authorization.
  if (auth === "OWNER-ORDER-443.192") console.log("authority: owner order relayed by Lead 443.192 (2026-10-17 12:15Z)");
  else if (!/^AUTH-\d+$/.test(auth)) throw new Error("--apply requires --auth AUTH-NNN | OWNER-ORDER-443.192");
  else execFileSync("node", ["scripts/verify-owner-authorization.mjs", auth], { stdio: "inherit" });
}
const googleOn = Boolean(process.env.GOOGLE_PLACES_API_KEY?.trim()) && process.env.GOOGLE_PLACES_ENABLED === "true";
if ((APPLY || FORK) && !googleOn) {
  // Without the key the engine reads "Google had no route" for every uncached leg — a false refusal, never a fill.
  throw new Error("--apply / --fork-commit need GOOGLE_PLACES_API_KEY + GOOGLE_PLACES_ENABLED=true in the environment");
}

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.192 deadhead backfill" });
else if (FORK) await assertNotProduction(db, { label: "443.192 deadhead backfill (fork)" });
const WRITE_RE = /^\s*(?:--[^\n]*\n\s*)*(UPDATE|INSERT|DELETE)\b|audit\.append_event\s*\(/i;

class NeedsGoogle extends Error {}
/** DRY RUN client: every write the engine issues is recorded and NOT sent; FOR UPDATE becomes a plain read. */
function recordingClient(real: pg.Client, writes: string[]) {
  return {
    query: async (sql: string, params?: unknown[]) => {
      if (WRITE_RE.test(sql)) {
        writes.push(`${sql.replace(/\s+/g, " ").trim().slice(0, 110)} | ${JSON.stringify(params ?? []).slice(0, 240)}`);
        return { rows: [], rowCount: 1 };
      }
      return real.query(sql.replace(/\s+FOR UPDATE\b/gi, ""), params as unknown[]);
    },
  };
}
const metersBetween = (a: { lat: number; lng: number }, b: { lat: number; lng: number }) => {
  const r = Math.PI / 180;
  const h = Math.sin(((b.lat - a.lat) * r) / 2) ** 2 + Math.cos(a.lat * r) * Math.cos(b.lat * r) * Math.sin(((b.lng - a.lng) * r) / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
};
const dryRoute = async (from: { lat: number; lng: number }, to: { lat: number; lng: number }) => {
  if (googleOn) return computeRouteReference(from, to);
  // A zero-length leg: Google returns no route, and the engine's own same-place rule (SAME_PLACE_M) records 0 — mimic it.
  if (metersBetween(from, to) < 1) return null;
  throw new NeedsGoogle(`NEEDS GOOGLE ${from.lat.toFixed(4)},${from.lng.toFixed(4)} -> ${to.lat.toFixed(4)},${to.lng.toFixed(4)} (uncached leg; set the Google env for a computed preview)`);
};

const one = async (sql: string, p: unknown[]) => (await db.query(sql, p)).rows[0] as Record<string, any>;
const ELIGIBILITY_SQL = `
  SELECT l.id::text, l.load_number::text, l.status::text, l.miles_deadhead::text,
         (l.soft_deleted_at IS NOT NULL OR l.voided_at IS NOT NULL) AS dead,
         EXISTS (SELECT 1 FROM driver_finance.settlement_lines sl
                   JOIN driver_finance.driver_settlements ds ON ds.id = sl.settlement_id
                  WHERE sl.load_id = l.id AND sl.voided_at IS NULL AND COALESCE(sl.is_active, true)
                    AND ds.voided_at IS NULL AND ds.status::text <> 'cancelled') AS on_settlement_line,
         EXISTS (SELECT 1 FROM driver_finance.driver_bills db
                   JOIN driver_finance.driver_settlements ds ON ds.id = db.settled_in_settlement_id
                  WHERE db.load_id = l.id AND db.voided_at IS NULL
                    AND ds.voided_at IS NULL AND ds.status::text <> 'cancelled') AS bill_settled
    FROM mdata.loads l
   WHERE l.operating_company_id = $1::uuid AND l.load_number::text = ANY($2::text[])
   ORDER BY l.load_number`;
// Scoped to these loads' postings: other activity on the live book must not read as this run's change.
const postingsHash = async (loadIds: string[]) =>
  createHash("md5").update(JSON.stringify((await db.query(
    `SELECT id::text, journal_entry_uuid::text, account_id::text, debit_or_credit::text, amount_cents::text
       FROM accounting.journal_entry_postings WHERE operating_company_id = $1::uuid AND load_id = ANY($2::uuid[]) ORDER BY id`,
    [USMCA, loadIds])).rows)).digest("hex");
const tb = async () => (await one(
  `SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).net;

// DRY RUN reads one snapshot; apply/fork keep READ COMMITTED so the engine's row locks behave as in the route.
await db.query(APPLY || FORK ? "BEGIN" : "BEGIN ISOLATION LEVEL REPEATABLE READ");
try {
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);
  const rows = (await db.query(ELIGIBILITY_SQL, [USMCA, LOAD_NUMBERS])).rows as Array<Record<string, any>>;
  const ids = rows.map((r) => r.id);
  const tb0 = await tb();
  const hash0 = await postingsHash(ids);
  console.log(`${APPLY ? "APPLY" : FORK ? "FORK COMMIT" : "DRY RUN (SELECT-only)"} · ${LOAD_NUMBERS.length} loads · trial balance ${tb0} · these loads' postings md5 ${hash0} · Google ${googleOn ? "ON" : "OFF (cache only)"}`);
  const found = new Set(rows.map((r) => r.load_number));
  for (const n of LOAD_NUMBERS) if (!found.has(n)) console.log(`REFUSED ${n}: no such USMCA load`);
  const tally = { filled: 0, skipped: 0, refused: 0, already: 0 };
  for (const r of rows) {
    const why = r.dead ? "soft-deleted / voided"
      : ["cancelled", "voided"].includes(r.status) ? `status ${r.status}`
      : r.on_settlement_line ? "on a live settlement (settlement line)"
      : r.bill_settled ? "its driver bill is settled into a live settlement"
      : null;
    if (why) { tally.refused++; console.log(`REFUSED ${r.load_number}: ${why} — unchanged`); continue; }
    if (r.miles_deadhead != null) { tally.already++; console.log(`ALREADY ${r.load_number}: miles_deadhead ${r.miles_deadhead} — never replaced`); continue; }
    await db.query("SAVEPOINT one");
    const writes: string[] = [];
    try {
      const client = APPLY || FORK ? db : recordingClient(db, writes);
      const out = await fillLoadDeadhead(client as never, { operatingCompanyId: USMCA, loadId: r.id, actorUserId: OWNER },
        APPLY || FORK ? computeRouteReference : (dryRoute as never));
      if (out.status !== "filled") {
        await db.query("ROLLBACK TO SAVEPOINT one");
        tally.skipped++;
        console.log(`SKIPPED ${r.load_number} (${r.status}): ${out.reason ?? out.status}`);
        continue;
      }
      if (APPLY || FORK) {
        const back = await one(
          `SELECT miles_deadhead::text m, deadhead_miles_calculation_method::text meth, miles_choice->'empty'->>'source' src
             FROM mdata.loads WHERE id = $1::uuid`, [r.id]);
        const aud = await one(
          `SELECT count(*)::int n FROM audit.audit_events
            WHERE event_class = 'dispatch.load.deadhead_filled' AND payload->>'load_id' = $1 AND created_at > now() - interval '1 hour'`, [r.id]);
        if (Number(back.m) !== out.miles || back.meth !== out.method || back.src !== "google" || aud.n < 1) {
          throw new Error(`read-back mismatch: ${JSON.stringify({ back, audit: aud.n, out })}`);
        }
        await db.query("RELEASE SAVEPOINT one");
        console.log(`FILLED ${r.load_number} (${r.status}): ${out.miles} mi · ${out.method} · read-back OK · audit dispatch.load.deadhead_filled ×${aud.n}`);
      } else {
        await db.query("ROLLBACK TO SAVEPOINT one");
        console.log(`WOULD FILL ${r.load_number} (${r.status}): ${out.miles} mi · ${out.method} · ${writes.length} write(s) captured, not sent`);
        for (const w of writes) console.log(`    · ${w}`);
      }
      tally.filled++;
    } catch (e) {
      await db.query("ROLLBACK TO SAVEPOINT one");
      if (e instanceof NeedsGoogle) { tally.skipped++; console.log(`PREVIEW ${r.load_number} (${r.status}): ${e.message}`); continue; }
      if (APPLY || FORK) throw e;
      tally.skipped++;
      console.log(`SKIPPED ${r.load_number} (${r.status}): ${(e as Error).message.slice(0, 240)}`);
    }
  }
  const tb1 = await tb();
  const hash1 = await postingsHash(ids);
  console.log(`${APPLY || FORK ? "filled" : "would fill"} ${tally.filled} · skipped ${tally.skipped} · already set ${tally.already} · refused ${tally.refused}`);
  console.log(`trial balance ${tb0} -> ${tb1} · postings md5 ${hash0 === hash1 ? "unchanged" : `CHANGED ${hash1}`}`);
  if (tb1 !== tb0 || hash1 !== hash0) throw new Error("REFUSE: a journal posting changed — deadhead is attribution only");
  await db.query(APPLY || FORK ? "COMMIT" : "ROLLBACK");
  console.log(APPLY || FORK ? "COMMITTED" : "DRY RUN — SELECT-only, nothing written");
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  throw e;
} finally {
  await db.end();
  setTimeout(() => process.exit(0), 2000);
}
