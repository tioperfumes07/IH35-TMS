// LEAD 443.194 (verify-canonical-customers: USMCA 2 duplicate customer groups, baseline 0). Measured 2026-10-17 (read-only):
// each group is one customer created TWICE by the same Owner session within 300 ms on 2026-10-16 through
// POST /api/v1/mdata/customers (audit source BT-1-CUSTOMER-FULL-PROFILE) — identical name, identical billing email,
// same type, no MC/DOT/tax id on either; the first-created row carries the load / invoices / lane / file link, the
// second carries nothing but its derived relationship-score row. Writer fixed in the same PR (create re-checks the
// canonical key under a lock inside its insert transaction).
//
// This merges each duplicate into its survivor through the canonical ENGINE only (mergeIntoCanonical: repoints every
// FK + loose reference, writes the alias with the row's snapshot + exact repoint log — reversible by
// reverseCanonicalMerge — removes the merged master row per owner law 2026-10-02 "no cancelled shells", audits, and
// asserts A/R to the cent). Refuses unless the evidence on the rows says SAME customer.
//   default: dry run in one transaction, ROLLED BACK · --fork-commit (assertNotProduction) · --apply --auth LEAD-ORDER-443.194
import pg from "pg";
import { assertIsIntendedProduction, assertNotProduction } from "../lib/assert-not-production.mjs";
import { mergeIntoCanonical, planCanonical, repointTargets } from "../../apps/backend/src/mdata/canonical/canonical-entities.service.ts";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const EXPECTED_GROUPS = 2; // measured 2026-10-17; any other count = the world changed, re-measure
const MAX_CREATE_GAP_MS = 2000; // a double submit, not two people entering the same name days apart
// Derived rows the engine may remove on a unique-key collision (the survivor already holds its own) — snapshotted in
// the alias repoint log and restored by reverseCanonicalMerge. Anything else removed = refuse.
const DERIVED_REMOVABLE = new Set(["master_data.customer_relationship_scores.customer_uuid"]);
const APPLY = process.argv.includes("--apply");
const FORK = process.argv.includes("--fork-commit");
if (APPLY) {
  const i = process.argv.indexOf("--auth");
  if ((process.argv[i + 1] ?? "") !== "LEAD-ORDER-443.194") throw new Error("--apply requires --auth LEAD-ORDER-443.194");
  // verify-owner-authorization: Lead ruling 2026-10-17 15:10Z #3 "if they are the same customer, merge through the
  // customer merge engine (audited, references repointed, nothing deleted)".
}
const AUTH_ID = APPLY ? "LEAD-ORDER-443.194" : FORK ? "LEAD-ORDER-443.194-FORK" : "DRY-RUN";

const db = new pg.Client({ connectionString: process.env.DATABASE_URL });
await db.connect();
if (APPLY) await assertIsIntendedProduction(db, { label: "443.194 merge duplicate customers" });
else if (FORK) await assertNotProduction(db, { label: "443.194 merge duplicate customers (fork)" });

const one = async <T = any,>(sql: string, v: unknown[] = []) => (await db.query(sql, v)).rows[0] as T;
const tb = async () =>
  (await one(`SELECT COALESCE(sum(CASE WHEN debit_or_credit='debit' THEN amount_cents ELSE -amount_cents END),0)::text net
     FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid`, [USMCA])).net as string;
const guardGroups = async () =>
  (await one(`SELECT count(*)::int n FROM (SELECT upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) k FROM mdata.customers
       WHERE operating_company_id=$1::uuid GROUP BY 1 HAVING count(*) > 1 AND upper(regexp_replace(customer_name,'[^A-Za-z0-9]','','g')) <> '') g`, [USMCA])).n as number;
/** Every reference (engine's own target list) to each id: { "schema.table.col": n } per id. */
const refs = async (ids: string[]) => {
  const out: Record<string, Record<string, number>> = Object.fromEntries(ids.map((i) => [i, {}]));
  for (const t of await repointTargets(db as never, "customer")) {
    const r = await db.query(`SELECT "${t.column}"::text v, count(*)::int n FROM ${t.table.split(".").map((p) => `"${p}"`).join(".")}
                                WHERE "${t.column}"::text = ANY($1::text[]) GROUP BY 1`, [ids]);
    for (const x of r.rows) out[x.v]![`${t.table}.${t.column}`] = x.n;
  }
  return out;
};
const sum = (m: Record<string, number>, skip?: Set<string>) => Object.entries(m).reduce((n, [k, v]) => n + (skip?.has(k) ? 0 : v), 0);

let ok = false;
try {
  await db.query("BEGIN");
  await db.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await db.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);
  await db.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER]);

  const tbBefore = await tb();
  const groupsBefore = await guardGroups();
  const plan = await planCanonical(db as never, USMCA, "customer");
  console.log(`guard groups ${groupsBefore} · engine plan groups ${plan.groups.length} · repoint targets ${plan.targets}`);
  if (plan.groups.length !== EXPECTED_GROUPS || groupsBefore !== EXPECTED_GROUPS)
    throw new Error(`REFUSE: expected ${EXPECTED_GROUPS} groups, guard ${groupsBefore} / plan ${plan.groups.length} — re-measure`);

  const allIds = plan.groups.flatMap((g) => [g.survivor.id, ...g.duplicates.map((d) => d.id)]);
  const refsBefore = await refs(allIds);
  const rows = new Map((await db.query(`SELECT id::text, customer_name, billing_email, customer_type::text, mc_number, dot_number,
        tax_id_encrypted, created_by_user_id::text, created_at, is_sample_data, source_system, deactivated_at, archived_at
      FROM mdata.customers WHERE id = ANY($1::uuid[]) AND operating_company_id=$2::uuid`, [allIds, USMCA])).rows.map((r: any) => [r.id, r]));

  // ── evidence: SAME customer, or refuse ──
  for (const g of plan.groups) {
    if (g.duplicates.length !== 1) throw new Error(`REFUSE ${g.key}: ${g.duplicates.length + 1} members (expected a pair)`);
    const s: any = rows.get(g.survivor.id), d: any = rows.get(g.duplicates[0]!.id);
    const why: string[] = [];
    if (s.customer_name !== d.customer_name) why.push("names differ beyond normalization");
    if ((s.billing_email ?? "") !== (d.billing_email ?? "")) why.push("billing email differs");
    if (s.customer_type !== d.customer_type) why.push("customer type differs");
    for (const k of ["mc_number", "dot_number"]) if ((s[k] ?? null) !== (d[k] ?? null)) why.push(`${k} differs`);
    if ((s.tax_id_encrypted == null) !== (d.tax_id_encrypted == null) || (s.tax_id_encrypted && !s.tax_id_encrypted.equals(d.tax_id_encrypted)))
      why.push("tax id differs");
    if (s.created_by_user_id !== d.created_by_user_id) why.push("different creators");
    if (Math.abs(new Date(s.created_at).getTime() - new Date(d.created_at).getTime()) > MAX_CREATE_GAP_MS) why.push("not created together");
    if (s.is_sample_data || d.is_sample_data) why.push("sample data");
    if (s.deactivated_at || d.deactivated_at || s.archived_at || d.archived_at) why.push("a member is inactive/archived");
    // the survivor is the one holding the business; the duplicate holds only derived rows
    if (sum(refsBefore[d.id]!, DERIVED_REMOVABLE) !== 0) why.push(`duplicate carries business references ${JSON.stringify(refsBefore[d.id])}`);
    if (new Date(s.created_at) > new Date(d.created_at)) why.push("survivor is not the first-created row");
    console.log(`${g.key}: survivor ${s.id} refs ${JSON.stringify(refsBefore[s.id])} · duplicate ${d.id} refs ${JSON.stringify(refsBefore[d.id])} · gap ${Math.abs(new Date(s.created_at).getTime() - new Date(d.created_at).getTime())}ms`);
    if (why.length) throw new Error(`REFUSE ${g.key}: not proven the same customer — ${why.join("; ")}`);
  }

  // ── merge through the engine only ──
  const merges = [];
  for (const g of plan.groups) {
    const d = g.duplicates[0]!;
    merges.push(await mergeIntoCanonical(db as never, USMCA, "customer", {
      survivorId: g.survivor.id, duplicateId: d.id, actorUserId: OWNER, authId: AUTH_ID,
      reason: `Lead 443.194: '${d.name}' (${d.id}) is a double-submitted create of '${g.survivor.name}' (${g.survivor.id}) — same creator, same body, created together`,
    }));
  }
  console.log(`merges ${JSON.stringify(merges)}`);

  // ── read-back ──
  const groupsAfter = await guardGroups();
  if (groupsAfter !== 0) throw new Error(`NOT VERIFIED: guard groups ${groupsAfter} (expected 0)`);
  const refsAfter = await refs(allIds);
  for (const g of plan.groups) {
    const s = g.survivor.id, d = g.duplicates[0]!.id;
    if (sum(refsAfter[d]!) !== 0) throw new Error(`NOT VERIFIED: ${d} still referenced ${JSON.stringify(refsAfter[d])}`);
    const before = sum(refsBefore[s]!, DERIVED_REMOVABLE) + sum(refsBefore[d]!, DERIVED_REMOVABLE);
    const after = sum(refsAfter[s]!, DERIVED_REMOVABLE);
    if (after !== before) throw new Error(`NOT VERIFIED: ${s} business references ${after} != ${before} before — a reference was lost`);
  }
  const aliases = (await db.query(`SELECT a.id::text, a.merged_customer_id::text merged, a.canonical_customer_id::text canonical, a.auth_id,
        (a.snapshot->>'id') snap_id, jsonb_array_length(a.repoint_log) log_tables,
        (SELECT count(*)::int FROM jsonb_array_elements(a.repoint_log) e, jsonb_array_elements(e->'removed_on_conflict') r) removed,
        (SELECT string_agg(DISTINCT (e->>'table')||'.'||(e->>'column'), ',') FROM jsonb_array_elements(a.repoint_log) e WHERE jsonb_array_length(e->'removed_on_conflict') > 0) removed_from
      FROM mdata.customer_aliases a WHERE a.merged_customer_id = ANY($1::uuid[]) AND a.reversed_at IS NULL`,
    [plan.groups.map((g) => g.duplicates[0]!.id)])).rows;
  console.log(`aliases ${JSON.stringify(aliases)}`);
  if (aliases.length !== plan.groups.length || aliases.some((a: any) => a.snap_id !== a.merged || a.auth_id !== AUTH_ID))
    throw new Error("NOT VERIFIED: an alias with the merged row's snapshot is missing");
  for (const a of aliases as any[]) for (const t of String(a.removed_from ?? "").split(",").filter(Boolean))
    if (!DERIVED_REMOVABLE.has(t)) throw new Error(`NOT VERIFIED: engine removed rows from ${t} (not a derived table)`);
  const audits = (await one(`SELECT count(*)::int n FROM audit.audit_events WHERE event_class='mdata.customer.canonical_merged'
      AND payload->>'auth_id' = $1 AND payload->>'resource_id' = ANY($2::text[])`, [AUTH_ID, plan.groups.map((g) => g.duplicates[0]!.id)])).n;
  if (audits !== plan.groups.length) throw new Error(`NOT VERIFIED: ${audits} merge audit rows (expected ${plan.groups.length})`);
  const tbAfter = await tb();
  console.log(`guard groups ${groupsBefore} -> ${groupsAfter} · audit rows ${audits} · trial balance before ${tbBefore} after ${tbAfter}`);
  if (tbAfter !== tbBefore || Number(tbAfter) !== 0) throw new Error("NOT VERIFIED: trial balance changed or not 0");

  if (APPLY || FORK) {
    await db.query("COMMIT");
    console.log("COMMITTED");
  } else {
    await db.query("ROLLBACK");
    console.log("DRY RUN — ROLLED BACK. Pass --fork-commit (fork) or --apply --auth LEAD-ORDER-443.194.");
  }
  ok = true;
} catch (e) {
  await db.query("ROLLBACK").catch(() => {});
  console.error(e);
} finally {
  await db.end();
  setTimeout(() => process.exit(ok ? 0 : 1), 2000);
}
