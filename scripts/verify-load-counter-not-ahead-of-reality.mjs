#!/usr/bin/env node
// P0 2026-09-14 (LOAD-NUMBER-COUNTER-BURN-ON-OPEN, item 4) — two layers:
//
// 1. STATIC (always runs, no DB needed): asserts the source shape that keeps the counter tied to
//    reality — the wizard mount path must never call the irreversible allocator (that was the
//    burn: 13611 -> open wizard -> close unsaved -> 13612), and the real allocator must skip past
//    any load_number a live row already holds (evidenced: cancelled ghost loads 13743/13749
//    permanently occupy their number under mdata.loads' plain, non-partial
//    UNIQUE(operating_company_id, load_number) constraint — a blind increment WILL eventually
//    re-mint one and fail at INSERT).
//
// 2. LIVE, DEGRADE-SAFE (only if DATABASE_URL/DATABASE_DIRECT_URL is set — never crashes CI
//    without one, matching scripts/verify-balanced-ledger.mjs's established pattern): for every
//    company with a lib.trace_counters LOAD row, the counter must never sit BEHIND the true
//    working max (a non-cancelled load already using a higher number — that is an immediate,
//    not just eventual, collision) and must never drift more than TOLERANCE ahead of it (the
//    burn signature: the counter climbing with no corresponding saved loads).
//
// TOLERANCE = 10. Justification: the live-proven burn regression was 16 numbers advanced in 90
// minutes of ordinary open-and-abandon use with ZERO loads saved — a real burn will clear a
// tolerance this size within a handful of wizard opens, long before it reaches poisoning scale
// (the original P1 incident was 166 numbers). 10 is generous enough to absorb the only known
// legitimate source of counter-ahead-of-committed-rows skew — a handful of concurrent in-flight
// saves that have claimed a number via reserveNextLoadId but whose mdata.loads row is not yet
// committed/visible at the instant this guard reads — without ever needing to be that generous
// in practice (real concurrent Book Load submissions from one dispatch office are a handful at
// most, not dozens).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LIVE_FILE = "apps/frontend/src/pages/dispatch/components/book-load-v4/LiveLoadIdBar.tsx";
const SERVICE_FILE = "apps/backend/src/dispatch/load-id-reservation.service.ts";
const SELFTEST = process.argv.includes("--selftest");
const TOLERANCE = 10;

function assertStatic(live, service) {
  const problems = [];
  if (/void reserveDispatchLoadId\(/.test(live) || /void reserveNextLoadId\(/.test(live))
    problems.push("wizard mount must never call a real allocator — that is the burn-on-open bug");
  if (!/void doPeek\(\)/.test(live)) problems.push("wizard mount must call the non-consuming peek");
  const allocator = service.split("export async function allocateNextLoadNumber")[1] ?? "";
  if (!/const MAX_COLLISION_SKIPS = 1000;/.test(allocator))
    problems.push("allocateNextLoadNumber must bound its collision-skip retry (a real bug elsewhere must fail loudly, not loop forever)");
  if (!/SELECT EXISTS \(SELECT 1 FROM mdata\.loads WHERE operating_company_id = \$1::uuid AND load_number = \$2\) AS exists/.test(allocator))
    problems.push("allocateNextLoadNumber must check the number lib.next_trace_no() returned against live mdata.loads before returning it");
  if (!/throw new Error\("load_number_allocator_exhausted_collision_retries"\)/.test(allocator))
    problems.push("exhausting the collision-skip budget must throw loudly, never silently return a doomed number");
  return problems;
}

async function checkLive() {
  const cs = process.env.DATABASE_DIRECT_URL || process.env.DATABASE_URL;
  if (!cs) {
    console.warn("[load-counter-not-ahead-of-reality] no DATABASE_URL — skipping live check (advisory). CI/cron with a DB is the real gate.");
    return [];
  }
  const { Client } = await import("pg");
  const client = new Client({ connectionString: cs });
  try {
    await client.connect();
  } catch (err) {
    console.warn(`[load-counter-not-ahead-of-reality] DB unreachable — skipping live check (advisory): ${err instanceof Error ? err.message : String(err)}`);
    return [];
  }
  try {
    await client.query(`SELECT set_config('app.bypass_rls', 'lucia', true)`);
    const { rows } = await client.query(`
      SELECT
        tc.operating_company_id::text AS opco,
        tc.last_trace_no::bigint AS counter,
        (SELECT MAX(load_number::bigint) FROM mdata.loads l
           WHERE l.operating_company_id = tc.operating_company_id
             AND l.load_number ~ '^[0-9]+$'
             AND l.status <> 'cancelled') AS true_max
      FROM lib.trace_counters tc
      WHERE tc.doc_type = 'LOAD'
    `);
    const problems = [];
    for (const row of rows) {
      const counter = Number(row.counter);
      const trueMax = row.true_max == null ? null : Number(row.true_max);
      if (trueMax == null) continue; // company has no non-cancelled numeric loads yet; nothing to compare
      if (counter < trueMax) {
        problems.push(
          `opco ${row.opco}: counter (${counter}) is BEHIND the true working max (${trueMax}) — the very next allocation collides with an existing live load, not just an eventual one`
        );
      } else if (counter - trueMax > TOLERANCE) {
        problems.push(
          `opco ${row.opco}: counter (${counter}) is ${counter - trueMax} ahead of the true working max (${trueMax}), beyond tolerance (${TOLERANCE}) — burn-on-open signature`
        );
      }
    }
    return problems;
  } finally {
    await client.end();
  }
}

const live = fs.readFileSync(path.join(ROOT, LIVE_FILE), "utf8");
const service = fs.readFileSync(path.join(ROOT, SERVICE_FILE), "utf8");

if (SELFTEST) {
  const mutations = [
    { live: live.replace("void doPeek();", "void reserveNextLoadId(operatingCompanyId);"), service },
    { live, service: service.replace("const MAX_COLLISION_SKIPS = 1000;", "") },
    {
      live,
      service: service.replace(
        "SELECT EXISTS (SELECT 1 FROM mdata.loads WHERE operating_company_id = $1::uuid AND load_number = $2) AS exists",
        "SELECT true AS exists"
      ),
    },
    { live, service: service.replace('throw new Error("load_number_allocator_exhausted_collision_retries");', "") },
  ];
  for (const [index, mutation] of mutations.entries()) {
    if (!assertStatic(mutation.live, mutation.service).length) {
      console.error(`verify-load-counter-not-ahead-of-reality SELFTEST FAIL: static mutation ${index + 1} survived`);
      process.exit(1);
    }
  }
  console.log(`verify-load-counter-not-ahead-of-reality SELFTEST PASS — ${mutations.length}/${mutations.length}`);
  process.exit(0);
}

const problems = assertStatic(live, service);
const liveProblems = await checkLive();
problems.push(...liveProblems);
if (problems.length) {
  console.error("verify-load-counter-not-ahead-of-reality FAIL:");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log("verify-load-counter-not-ahead-of-reality PASS");
