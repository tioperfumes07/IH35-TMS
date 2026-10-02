#!/usr/bin/env node
// ROUND 321 (CC-1) — lease-to-own ASC 842 LESSEE posting (leases/lessee-posting.service.ts).
// static: signLease capitalizes a lease_to_own in the sign transaction (createJournalEntryOnClient, Dr rou_asset /
//         Cr lease_liability); the bill engine bills a capitalized contract against lease_liability and posts each
//         line's period JE after the bill (created or already existing — heals); the period post is idempotent
//         (FOR UPDATE + accretion_je_id / posted_at) and fails closed before migration 202615210000 is applied.
// live (read-only, FAIL-CLOSED without DATABASE_URL; PENDING-APPLY before the migration): every capitalized contract's
//         commencement JE exists, is posted and equals lessee_liability_initial_cents = sum of its period-1 opening
//         liabilities; every posted schedule row's JE exists; no billed period left unposted for more than a day.
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "../lib/require-live-db.mjs";

const LABEL = "verify-lease-to-own-posting";
const ROOT = new URL("../../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const F = { post: "apps/backend/src/leases/lessee-posting.service.ts", eng: "apps/backend/src/leases/lease-engine.service.ts", bill: "apps/backend/src/leases/lease-bill-engine.service.ts" };

export function staticProblems(s) {
  const p = [];
  if (!/if \(row\.lease_type === "lease_to_own"\) \{[\s\S]{0,120}await capitalizeLeaseToOwnOnSign\(client, opco, actorUserId, leaseId\)/.test(s.eng)) p.push("signLease must capitalize a lease_to_own inside the sign transaction");
  if (!/createJournalEntryOnClient\(/.test(s.post) || /\bcreateJournalEntry\(/.test(s.post)) p.push("lessee JEs must post on the caller's client (createJournalEntryOnClient), never a second transaction");
  if (!/legPair\(schedule\.liability_initial_cents, rouAccount, liabilityAccount/.test(s.post)) p.push("commencement must be Dr rou_asset / Cr lease_liability at the PV");
  if (!/FOR UPDATE OF s/.test(s.post) || !/if \(row\.accretion_je_id \|\| row\.posted\)/.test(s.post)) p.push("period post must lock the schedule row and post once");
  if ((s.post.match(/if \(!\(await lesseeSchemaReady\(client\)\)\)/g) ?? []).length < 3) p.push("every lessee entry point must fail closed before migration 202615210000 is applied");
  if (!/const capAccount = await capitalizedBillAccount\(client, opco, c\.id\)/.test(s.bill)) p.push("the bill engine must bill a capitalized contract against lease_liability");
  if ((s.bill.match(/await postLesseePeriodsForBill\(opco, actorUserId, plan, /g) ?? []).length !== 2) p.push("the period JE must post after a created AND an already-existing bill (heal)");
  return p;
}

const src = Object.fromEntries(Object.entries(F).map(([k, v]) => [k, read(v)]));
const own = staticProblems(src);
if (own.length) {
  console.error(`${LABEL}: STATIC FAIL — ${own.join("; ")}`);
  process.exit(1);
}
const plants = [
  ["no capitalize on sign", { ...src, eng: src.eng.replace("await capitalizeLeaseToOwnOnSign(client, opco, actorUserId, leaseId)", "void 0") }],
  ["second transaction", { ...src, post: src.post + "\nawait createJournalEntry(x);" }],
  ["no heal", { ...src, bill: src.bill.replace("await postLesseePeriodsForBill(opco, actorUserId, plan, exists.id, out);", "") }],
  ["no lock", { ...src, post: src.post.replace("FOR UPDATE OF s", "") }],
];
for (const [name, planted] of plants) {
  if (!staticProblems(planted).length) {
    console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`);
    process.exit(1);
  }
}
console.log(`${LABEL} --selftest PASS (static clean; ${plants.length}/${plants.length} plants caught)`);
if (process.argv.includes("--selftest")) process.exit(0);

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const ready = (await client.query(`SELECT to_regclass('accounting.lease_lessee_schedule_period') IS NOT NULL AS ok`)).rows[0].ok;
  if (!ready) {
    await client.query("ROLLBACK");
    console.log(`${LABEL}: LIVE PENDING-APPLY — migration 202615210000 not applied on this database yet (static PASS).`);
    process.exit(0);
  }
  const bad = (await client.query(
    `SELECT lc.id::text, COALESCE(lc.display_id, left(lc.id::text, 8)) AS display, lc.lessee_liability_initial_cents AS initial,
            je.id IS NULL AS no_je, je.status AS je_status, je.voided_at IS NOT NULL AS je_void,
            (SELECT COALESCE(sum(p.amount_cents), 0) FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = je.id AND p.debit_or_credit = 'debit') AS je_dr,
            (SELECT COALESCE(sum(s.liability_open_cents), 0) FROM accounting.lease_lessee_schedule_period s WHERE s.lease_contract_id = lc.id AND s.period_no = 1 AND s.voided_at IS NULL) AS sched
       FROM accounting.lease_contract lc
       LEFT JOIN accounting.journal_entries je ON je.id = lc.lessee_commencement_je_id
      WHERE lc.lessee_classification IS NOT NULL AND lc.voided_at IS NULL`
  )).rows.filter((r) => r.no_je || r.je_void || r.je_status !== "posted" || Number(r.je_dr) !== Number(r.initial) || Number(r.sched) !== Number(r.initial));
  const orphanJe = (await client.query(
    `SELECT count(*)::int n FROM accounting.lease_lessee_schedule_period s
      WHERE s.voided_at IS NULL AND s.accretion_je_id IS NOT NULL AND NOT EXISTS (SELECT 1 FROM accounting.journal_entries j WHERE j.id = s.accretion_je_id)`
  )).rows[0].n;
  const unposted = (await client.query(
    `SELECT count(*)::int n FROM accounting.lease_lessee_schedule_period s
      JOIN accounting.bills b ON b.lease_contract_id = s.lease_contract_id AND b.lease_period_start = s.period_start AND b.voided_at IS NULL
      WHERE s.voided_at IS NULL AND s.posted_at IS NULL AND b.created_at < now() - interval '1 day'`
  )).rows[0].n;
  const counts = (await client.query(
    `SELECT (SELECT count(*)::int FROM accounting.lease_contract WHERE lessee_classification IS NOT NULL AND voided_at IS NULL) contracts,
            (SELECT count(*)::int FROM accounting.lease_lessee_schedule_period WHERE posted_at IS NOT NULL AND voided_at IS NULL) posted`
  )).rows[0];
  await client.query("ROLLBACK");
  const problems = [];
  if (bad.length) problems.push(`${bad.length} capitalized contract(s) whose commencement JE is missing / void / unposted / != liability: ${bad.map((r) => r.display).join(", ")}`);
  if (orphanJe) problems.push(`${orphanJe} schedule row(s) point at a JE that does not exist`);
  if (unposted) problems.push(`${unposted} billed period(s) with no ASC 842 period JE after a day (run the lease bill engine to heal)`);
  if (problems.length) {
    console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: LIVE PASS — ${counts.contracts} capitalized contract(s) with a posted commencement JE = liability; ${counts.posted} posted period(s); no orphan or unhealed period.`);
} finally {
  client.release();
  await pool.end();
}
