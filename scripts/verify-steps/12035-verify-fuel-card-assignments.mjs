#!/usr/bin/env node
// E-22 addition: fuel card -> truck (+ driver) registry, "so a card alone can resolve a unit".
//
// --selftest (static + pure): migration is forced-RLS, audited, refuses delete, stores last digits only,
//   refuses overlapping active assignments; the statement importer falls back to the card ONLY when
//   the unit number is missing/unmatched, records why, and never writes a full card number to notes;
//   routes are mounted, write-gated to accounting roles, and offer the reverse (unit / driver) read.
// live (read-only): once the table exists on this database, no two active assignments for one card
//   overlap and every assignment's truck is in its company's fleet. Before the deploy that creates it,
//   says so (NOT live proof of the table).
import pg from "pg";
import { readFileSync } from "node:fs";
import { register as registerTsx } from "tsx/esm/api";

registerTsx();

const LABEL = "verify-fuel-card-assignments";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");

async function selftest() {
  const assert = (await import("node:assert/strict")).default;
  const { cardDigits } = await import(new URL("apps/backend/src/fuel/fuel-card-assignments.service.ts", ROOT));
  assert.equal(cardDigits("XXXX-XXXX-XXXX-1234"), "1234");
  assert.equal(cardDigits("7083 0512 3456 7890"), "7083051234567890");
  assert.equal(cardDigits("12"), null, "fewer than 4 digits is no card");
  assert.equal(cardDigits(null), null);
  const mig = read("db/migrations/202615140600_fuel_card_assignments.sql");
  assert.ok(/FORCE ROW LEVEL SECURITY/.test(mig) && /tg_audit_row/.test(mig), "forced RLS + audit");
  assert.ok(/card_last_digits ~ '\^\[0-9\]\{4,6\}\$'/.test(mig), "last digits only, never a full card number");
  assert.ok(/rows are voided, never deleted/.test(mig) && /BEFORE DELETE/.test(mig), "delete refused");
  assert.ok(/tstzrange\(a\.effective_from, a\.effective_to\) && tstzrange/.test(mig) && /pg_advisory_xact_lock/.test(mig), "no overlapping active assignment, under a lock");
  assert.ok(/owner_company_id = NEW\.operating_company_id OR u\.currently_leased_to_company_id/.test(mig), "truck must be in the company's fleet");
  const imp = read("apps/backend/src/fuel/fuel-transaction-import.ts");
  assert.ok(/if \(!unitId && row\.card_number\)/.test(imp) && /resolveUnitByCard\(/.test(imp), "importer falls back to the card only when the unit is unresolved");
  assert.ok(/card_unresolved=\$\{byCard\.reason\}/.test(imp), "an unresolved card states why");
  assert.ok(!/`card=\$\{row\.card_number\}`/.test(imp), "a full card number must never land in notes");
  const svc = read("apps/backend/src/fuel/fuel-card-assignments.service.ts");
  assert.ok(/ambiguous_assignment/.test(svc) && /LIMIT 2/.test(svc), "two matching assignments is ambiguity, never a pick");
  const routes = read("apps/backend/src/fuel/fuel-card-assignments.routes.ts");
  assert.equal((routes.match(/if \(!requireCardWriteRole\(reply/g) ?? []).length, 3, "create / end / void are accounting-role gated");
  assert.ok(/unit_id: q\.data\.unit_id/.test(routes) && /driver_id: q\.data\.driver_id/.test(routes), "reverse read: unit -> cards, driver -> cards");
  assert.ok(/registerFuelCardAssignmentRoutes\(app\)/.test(read("apps/backend/src/index.ts")), "routes mounted");
  console.log(`${LABEL} --selftest PASS (16/16)`);
}

if (process.argv.includes("--selftest")) {
  await selftest();
  process.exit(0);
}
await selftest();

const url = process.env.DATABASE_URL;
if (!url) {
  console.error(`${LABEL}: FAIL — DATABASE_URL not set and this guard does not declare ALLOW_OFFLINE_SKIP.`);
  process.exit(1);
}
const client = new pg.Client({ connectionString: url });
await client.connect();
try {
  await client.query("BEGIN");
  // Same read posture as every live guard: the table is FORCED-RLS, so a bare read could return a
  // masked zero. neondb_owner exists on Neon only; a fresh CI database reads as its superuser.
  const hasOwner = (await client.query(`SELECT 1 FROM pg_roles WHERE rolname = 'neondb_owner'`)).rows.length > 0;
  if (hasOwner) await client.query("SET LOCAL ROLE neondb_owner");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  await client.query("SET LOCAL default_transaction_read_only = on");
  const exists = (await client.query(`SELECT to_regclass('fuel.fuel_card_assignments') IS NOT NULL AS ok`)).rows[0].ok;
  if (!exists) {
    console.log(`DATABASE PHASE: fuel.fuel_card_assignments not on this database yet (migration 202615140600 lands with the next deploy) — static proof only, NOT live proof of the table`);
    process.exit(0);
  }
  const overlap = await client.query(
    `SELECT a.id::text, b.id::text AS other FROM fuel.fuel_card_assignments a JOIN fuel.fuel_card_assignments b
       ON a.operating_company_id = b.operating_company_id AND a.card_last_digits = b.card_last_digits
      AND a.fuel_card_type_id IS NOT DISTINCT FROM b.fuel_card_type_id AND a.id < b.id
      AND a.voided_at IS NULL AND b.voided_at IS NULL
      AND tstzrange(a.effective_from, a.effective_to) && tstzrange(b.effective_from, b.effective_to)`
  );
  const foreign = await client.query(
    `SELECT a.id::text FROM fuel.fuel_card_assignments a JOIN mdata.units u ON u.id = a.unit_id
      WHERE a.voided_at IS NULL AND NOT (u.owner_company_id = a.operating_company_id OR u.currently_leased_to_company_id IS NOT DISTINCT FROM a.operating_company_id)`
  );
  const n = (await client.query(`SELECT count(*)::int n, count(*) FILTER (WHERE voided_at IS NULL)::int active FROM fuel.fuel_card_assignments`)).rows[0];
  await client.query("ROLLBACK");
  const problems = [
    ...overlap.rows.map((r) => `overlapping active assignments ${r.id} / ${r.other}`),
    ...foreign.rows.map((r) => `assignment ${r.id} puts a card on a truck outside its company's fleet`),
  ];
  if (problems.length) {
    console.error(`${LABEL}: FAIL — ${problems.slice(0, 10).join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${n.n} assignment(s), ${n.active} active; no overlap, every truck in its company's fleet.`);
} finally {
  await client.end();
}
