/**
 * LEAD 443.333 — DELETE every USMCA coder TEST record in Legal + Insurance (lawsuits, matters, claims, policies).
 *
 * OWNER: "those lawsuits are tests" (2026-10-24 ~4:00 PM CT); "test recrods shuold be deleted permanently"
 * (2026-10-22 3:36 PM CT); "if you recommend deleting, delete" (2026-10-24).
 * Measured 10-24 (prod, bypass lucia), USMCA only:
 *   insurance.lawsuit 2  — "CODEX TEST PLAINTIFF", "TEST DATA plaintiff keep"
 *   legal.matters    18  — SAMPLE / CASCADE / CODEX / CC3 / TEST-named, all closed, 0 reserve JEs, 0 bills / expenses / liabilities
 *   insurance.claim   7  — SAMPLE / LIVE-GATE-PROVE / CODEX / TEST-CC3 / CC3-SCEN01, all closed, 0 recovery postings, 0 JEs
 *   insurance.policy  5  — SAMPLE / TEST-CODEX / POL-TESTMTDQ164H, all cancelled
 *   safety.accident_reports 3 — "CC3-SCEN01-20260829 Laredo TX" (linked to the CC3 test claim; 2 TEST cost lines) + 2 "USMCA TEST yard"
 * KEPT: the 3 real active policies 437540, 437539, CIMD-2026-0720.
 *
 * Refuses unless every target still carries a test name, no matter has a reserve JE, every policy is cancelled, the
 * 3 real policies are untouched, and the books (JEs / postings / bank lines / expenses / bills) are unchanged.
 * The dry run EXECUTES the purge and rolls it back (proves the cascade). --apply + OWNER_AUTH_ID=AUTH-NNN commits
 * through accounting._purge_rows_cascade (every row, children included, written to audit.record_deletions).
 */
import pg from "pg";

const CO = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER_USER_ID = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const COMMIT = process.argv.includes("--apply");
const AUTH = COMMIT ? (process.env.OWNER_AUTH_ID ?? "") : "AUTH-0";
const REASON = "443.333: coder TEST record in Legal/Insurance (USMCA) — owner 10-24 'those lawsuits are tests'; 10-22 test records deleted permanently";
const TEST_RE = /test|codex|cc3|sample|cascade|scen|probe|battery|live-gate/i;
const REAL_POLICIES = ["7dc0e94b-d631-4eb4-971e-f4330d42b1bc", "e9110b0d-05d7-463e-91c1-3a00ffa632f7", "7041aaaf-dbc3-41bc-8425-9a679f3dbb57"];

const LAWSUITS = ["0f7ec483-16b3-49c8-a21a-c06acd04b198", "cdcca42d-42a2-435f-867e-5581548b3749"];
const MATTERS = [
  "34a494e6-9300-4c70-a4eb-73ada160b79e", "b3ab19df-fb1f-494d-8e5e-08ebfbca07c6", "be3ec5bc-1f74-47a1-994a-239ea0d3d25e",
  "3bea7753-a623-4329-b88f-a83c7ccbef4d", "0dded415-dfe4-4a95-af53-481f7826273d", "96aa003c-a0af-4ab7-ad1d-77c5acabd773",
  "204be6ec-b649-4cf8-83c5-a740837a8446", "b9753401-58f1-4833-bf46-4a048628e784", "4e4db72a-dd22-4c62-ad5b-eb338ff21313",
  "5105d724-0f82-4f1d-8530-dc41edb30043", "48bf922c-b152-4583-9fea-2c397027edae", "466a5c51-e151-4879-9537-9079f9b14b1b",
  "c64b8cb8-86a4-44fc-9386-8a9d1659f6d5", "22ef7e3b-c234-4a1d-bad6-3b712e5985c1", "d0007f05-8c92-4ee4-9b56-916b80cb329c",
  "8f4595aa-dd78-4a76-ad8c-5d8ae9015bfd", "dd93c2f3-7b8f-48fb-928e-c15838f6aa9b", "fa09fac2-00e6-4d30-b322-cc88c5ef8940",
];
const CLAIMS = [
  "cef90406-a260-40b8-93ae-87ea145ee13d", "67ee311f-7e2a-4866-a42a-516a6332c13f", "c469b5cc-9270-439c-b368-8f08ced8bf5f",
  "77be8d21-6f2e-4081-b816-ae79676ee55a", "783e0f3a-4e40-45a7-a4bb-f493f2e350e7", "0ac5af38-f2e2-4d2a-91cc-8e2a75629c01",
  "2fafc5c7-b12d-41b4-87d1-0801dd47df92",
];
const POLICIES = [
  "a1978702-b253-4f90-8326-c4b6c6a2f793", "3b217c01-1350-4253-ab5a-b1dd8a0969c7", "fddcdeac-21aa-4328-9cc4-de2e2db69333",
  "8aa8b472-e7e3-4dfb-849b-08dc0f41c04e", "26571c5a-6f7c-4f34-874e-986af564491e",
];
const ACCIDENT_REPORTS = [ // CC3-SCEN01 scenario report (2 TEST cost lines) + 2 "USMCA TEST yard" reports
  "2b3d6512-a704-42d9-860b-38cb24ae069d", "676acc23-b11e-491f-92a4-34e066d556bb", "a4b6406f-007c-4b49-8fde-ca85a35f809f",
];
// Purge order: rows that reference others first. claim.accident_report_id <-> accident_reports.insurance_claim_id is a
// cycle the FK-walking cascade cannot finish (depth limit); both links are cleared inside the transaction first.
const STEPS: Array<[string, string, string[], string]> = [
  ["insurance", "lawsuit", LAWSUITS, "row_to_json(x)::text"],
  ["legal", "matters", MATTERS, "x.matter_number"],
  ["insurance", "claim", CLAIMS, "x.claim_number"],
  ["safety", "accident_reports", ACCIDENT_REPORTS, "x.location"],
  ["insurance", "policy", POLICIES, "x.policy_number"],
];

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL required");
if (COMMIT && !/^AUTH-[0-9]+$/.test(AUTH)) throw new Error("--apply requires OWNER_AUTH_ID=AUTH-NNN");

const c = new pg.Client({ connectionString: process.env.DATABASE_URL });
await c.connect();
const books = async () => (await c.query(
  `SELECT (SELECT count(*) FROM accounting.journal_entries WHERE operating_company_id=$1::uuid)::int je,
          (SELECT count(*) FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid)::int postings,
          (SELECT coalesce(sum(amount_cents),0) FROM accounting.journal_entry_postings WHERE operating_company_id=$1::uuid)::text posting_sum,
          (SELECT count(*) FROM banking.bank_transactions WHERE operating_company_id=$1::uuid)::int bank_txns,
          (SELECT count(*) FROM accounting.expenses WHERE operating_company_id=$1::uuid)::int expenses,
          (SELECT count(*) FROM accounting.bills WHERE operating_company_id=$1::uuid)::int bills`, [CO])).rows[0];
const out: Record<string, unknown> = { mode: COMMIT ? `COMMIT ${AUTH}` : "DRY RUN (purge executed, then ROLLBACK)" };
try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [CO]);
  await c.query("SELECT set_config('app.current_user_id',$1,true)", [OWNER_USER_ID]);
  await c.query("SELECT set_config('app.purge_auth_id',$1,true)", [AUTH]);

  const pre: Record<string, unknown[]> = {};
  for (const [sch, tbl, ids, label] of STEPS) {
    const rows = (await c.query(
      `SELECT x.id::text, ${label} AS label FROM ${sch}.${tbl} x WHERE x.id = ANY($1::uuid[]) AND x.operating_company_id = $2::uuid`,
      [ids, CO])).rows;
    if (rows.length !== ids.length) throw new Error(`${sch}.${tbl}: expected ${ids.length}, found ${rows.length}`);
    for (const r of rows) if (!TEST_RE.test(String(r.label))) throw new Error(`${sch}.${tbl} ${r.id}: "${r.label}" is not a test name — refusing`);
    pre[`${sch}.${tbl}`] = rows.map((r) => String(r.label).slice(0, 60));
  }
  out.pre_check = pre;
  const reserves = Number((await c.query(
    `SELECT count(*) n FROM legal.matters WHERE id = ANY($1::uuid[]) AND (reserve_journal_entry_id IS NOT NULL OR coalesce(reserve_posted_cents,0) <> 0)`,
    [MATTERS])).rows[0].n);
  if (reserves) throw new Error(`${reserves} matter(s) have a posted reserve — refusing`);
  const liveP = Number((await c.query(`SELECT count(*) n FROM insurance.policy WHERE id = ANY($1::uuid[]) AND status <> 'cancelled'`, [POLICIES])).rows[0].n);
  if (liveP) throw new Error(`${liveP} target policy(ies) not cancelled — refusing`);

  const b0 = await books();
  out.links_cleared = {
    claim_to_report: (await c.query(`UPDATE insurance.claim SET accident_report_id = NULL WHERE id = ANY($1::uuid[]) AND accident_report_id IS NOT NULL`, [CLAIMS])).rowCount,
    report_to_claim: (await c.query(`UPDATE safety.accident_reports SET insurance_claim_id = NULL WHERE id = ANY($1::uuid[]) AND insurance_claim_id IS NOT NULL`, [ACCIDENT_REPORTS])).rowCount,
  };
  const deleted: Record<string, number> = {};
  for (const [sch, tbl, ids] of STEPS) {
    out.step = `${sch}.${tbl}`;
    await c.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason)
                   SELECT $1, $2, unnest($3::text[]), $4 ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`,
      [AUTH, `${sch}.${tbl}`, ids, REASON]);
    if (tbl === "matters") {
      // legal.matter_events is append-only; its trigger admits a DELETE only for rows listed under this AUTH.
      const ev = await c.query(`INSERT INTO _system.purge_authorized_rows (auth_id, table_name, row_pk, reason)
                     SELECT $1, 'legal.matter_events', e.id::text, $3 FROM legal.matter_events e WHERE e.matter_id = ANY($2::uuid[])
                     ON CONFLICT (auth_id, table_name, row_pk) DO NOTHING`, [AUTH, ids, REASON]);
      out.matter_events_authorized = ev.rowCount;
    }
    const n = (await c.query(`SELECT accounting._purge_rows_cascade($1,$2,$3::uuid[],$4::uuid,$5,$6::uuid,$7) n`,
      [sch, tbl, ids, CO, AUTH, OWNER_USER_ID, REASON])).rows[0].n;
    deleted[`${sch}.${tbl}`] = Number(n);
    const left = Number((await c.query(`SELECT count(*) n FROM ${sch}.${tbl} WHERE id = ANY($1::uuid[])`, [ids])).rows[0].n);
    if (left) throw new Error(`${sch}.${tbl}: ${left} still present after purge`);
  }
  out.rows_deleted_incl_children = deleted;
  out.deletions_recorded = Number((await c.query(`SELECT count(*) n FROM audit.record_deletions WHERE auth_id = $1`, [AUTH])).rows[0].n);
  const realLeft = Number((await c.query(`SELECT count(*) n FROM insurance.policy WHERE id = ANY($1::uuid[])`, [REAL_POLICIES])).rows[0].n);
  if (realLeft !== 3) throw new Error(`real policies touched: ${realLeft}/3 remain — refusing`);
  out.real_policies_kept = realLeft;
  out.usmca_left = (await c.query(
    `SELECT (SELECT count(*) FROM insurance.lawsuit WHERE operating_company_id=$1::uuid)::int lawsuits,
            (SELECT count(*) FROM legal.matters WHERE operating_company_id=$1::uuid)::int matters,
            (SELECT count(*) FROM insurance.claim WHERE operating_company_id=$1::uuid)::int claims,
            (SELECT count(*) FROM insurance.policy WHERE operating_company_id=$1::uuid)::int policies,
            (SELECT count(*) FROM safety.accident_reports WHERE operating_company_id=$1::uuid)::int accident_reports`, [CO])).rows[0];
  const b1 = await books();
  out.books_before = b0; out.books_after = b1;
  if (JSON.stringify(b0) !== JSON.stringify(b1)) throw new Error("BOOKS CHANGED — refusing");
  await c.query(COMMIT ? "COMMIT" : "ROLLBACK");
  out.status = COMMIT ? "COMMITTED" : "DRY_RUN_ROLLED_BACK";
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  out.status = "ROLLED_BACK"; out.error = (e as Error).message;
  console.log(JSON.stringify(out, null, 2)); await c.end(); process.exit(1);
}
console.log(JSON.stringify(out, null, 2));
await c.end();
