// Owner chat 2026-10-04 — "IT IS A REEFER 10219", "OK LETS FINISH THEM ALL" (answering: correct 10219's type; fix the
// 99133290 duplicate by keeping the complete document on load 13534; post reefer to its own account 5015).
//
// STEP 1  trailer 10219 (3c804758, owned by IH 35 Trucking LLC, leased to USMCA): equipment_type DryVan -> Reefer, the same
//         UPDATE + fleet.trailer.updated audit the trailer edit route writes (scoped to the USMCA lease). Owner-ordered.
// STEP 2  the 2026-09-08 T156 reefer fill (097923fb, load 13585): trailer 10219, which settlement 5803 prints for 13585,
//         through setReeferTrailer (it refused 10219 while it was typed DryVan).
// STEP 3  receipt 99133290 (Love's Mandeville LA, 2026-08-20): settlement 5781 prints it ONCE (DEF $24.59 + reefer
//         $246.04). Expense 13523-32 holds both; 13534-28 holds the reefer again. Load 13523 ran 08-15 -> 08-18, load 13534
//         08-19 -> 08-21, so the fill is 13534's. 13534-28 (the extra, reefer-only copy) is voided by executeVoidCancel.
// STEP 4  applyReclassify (the one reclass engine: batch, reclass JE, document line rewritten, undo from Accounting >
//         Reclassify), committed after steps 1-3:
//           A  13523-32 reefer line -> load 13534 + account 5015
//           B  13523-32 DEF line    -> load 13534
//           C  the live reefer-item lines still on 5000 -> account 5015 (13517-17, 13517-19, 13523-30, 13523-31,
//              13561-10, 13599-23)
//           D  the 4 fuel-card fills the Relay product code proved reefer (13552-5, 13585-5, 13587, 13588-2), still on
//              the Fuel-Truck Diesel item -> item Fuel-Reefer-Diesel (its account is 5015; the reefer category follows)
//
// PHASES (one AUTH): --phase 1 = steps 1-3 + batches A, C, D (all pass the batch CHECK as it stands);
//   --phase 2 = batch B only (a LOAD-only move), after 202615400800 widened reclassify_batches_changes_something on the
//   target database — refused before that, never silently skipped. Phase 1 turns verify-expense-line-account-matches-item
//   green (red on main since 202615400930 pointed the reefer item at 5015 while these lines still posted to 5000).
// Modes: default = DRY RUN (steps 1-3 rolled back, step 4 printed). --apply --auth AUTH-NNN = commit (AUTH verified OPEN on
// main). --rehearse = commit WITHOUT an AUTH, only on a database that is NOT the production endpoint (Neon fork rehearsal).
import { execFileSync } from "node:child_process";
import pg from "pg";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";
import { setReeferTrailer } from "../../apps/backend/src/fuel/reefer-fuel.service.js";
import { applyReclassify } from "../../apps/backend/src/accounting/reclassify/reclassify.service.js";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const PROD_ENDPOINT = "ep-broad-block-akykk7bw";
const T10219 = "3c804758-1f9c-402a-b1e9-5eb6e2061001";
const FILL_0908 = "097923fb-a434-4b75-9ba1-5dd45af72c05";
const DUP_EXPENSE = "81ff108d-69e7-4f67-9aed-66bd5d022a2b"; // 13534-28
const KEEP_EXPENSE = "d1c72fca-b4e8-4674-8492-7b2d4b4a5468"; // 13523-32
const LOAD_13534 = "34fa267e-9c11-4e9f-89e3-e2aa48d0b80e";
const ACCT_5015 = "7622e5f8-4ffe-4926-8736-3a02933a3b52";
const ITEM_REEFER = "a2df9d70-b35b-45f3-bf86-9c32bdc0a1c5";
const P_A = ["1d94e492-18e1-4664-9567-eb758e4e1e24"];
const P_B = ["8314452b-ed51-4ef1-9917-4cc339b0ed04"];
const P_C = [
  "ff5f35cd-3cc1-4c18-9e67-2d62a3556548", "dab891a8-11e6-4556-94f9-d5f0f2312af8", "23a54a00-07b8-41bd-bebe-4a926eb41079",
  "40704682-ad05-4c86-9e8b-794b08eff1eb", "f70a330b-03f9-4f8b-b23a-e3e859c6e6c4", "2a964d3a-f7ba-4783-89b6-66cec0d9636c",
];
const P_D = [
  "fb26f2a5-a8f9-4689-88e8-fc5bb43d5d73", "bb43c620-c8d4-47dd-ac49-4e13c96ed4e1", "f7999d24-870f-49d3-a809-e18b3f905ee1",
  "1c169255-459e-4861-b1e5-cdbdcb959f47",
];

const apply = process.argv.includes("--apply");
const rehearse = process.argv.includes("--rehearse");
const url = process.env.DATABASE_URL ?? "";
if (!url) throw new Error("DATABASE_URL required");
if (apply) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}
if (rehearse && url.includes(PROD_ENDPOINT)) throw new Error("REFUSE: --rehearse never runs against the production endpoint");
const commit = apply || rehearse;
const pi = process.argv.indexOf("--phase");
const phase = pi > 0 ? Number(process.argv[pi + 1]) : NaN;
if (phase !== 1 && phase !== 2) throw new Error("--phase 1 or --phase 2 is required");

const out: Record<string, unknown> = { phase };
const c = new pg.Client({ connectionString: url });
await c.connect();
const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
if (phase === 2) {
  const ck = await q(`SELECT pg_get_constraintdef(oid) d FROM pg_constraint WHERE conname = 'reclassify_batches_changes_something'`);
  if (!/to_load_id/.test(ck[0]?.d ?? "")) throw new Error("REFUSE phase 2: 202615400800 is not applied on this database (the batch CHECK does not count to_load_id)");
  const b = await q(
    `SELECT (SELECT load_number FROM mdata.loads WHERE id = p.load_id) ld, p.reversed_by_line_id IS NULL live FROM accounting.journal_entry_postings p WHERE p.id = $1::uuid`,
    [P_B[0]],
  );
  if (b[0]?.ld !== "13523" || !b[0]?.live) throw new Error(`REFUSE phase 2: DEF posting not as measured ${JSON.stringify(b)}`);
  await c.end();
} else try {
  await c.query("BEGIN");
  await c.query("SELECT set_config('app.bypass_rls','lucia',true)");
  await c.query("SELECT set_config('app.operating_company_id',$1,true)", [USMCA]);

  // Preconditions — every row exactly as measured, or nothing is written.
  const t = await q(`SELECT equipment_number, equipment_type, currently_leased_to_company_id::text lessee FROM mdata.equipment WHERE id = $1::uuid`, [T10219]);
  if (t[0]?.equipment_number !== "10219" || t[0]?.equipment_type !== "DryVan" || t[0]?.lessee !== USMCA) throw new Error(`REFUSE 10219 ${JSON.stringify(t)}`);
  const f = await q(
    `SELECT l.load_number, ft.trailer_id, ft.fuel_type FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id WHERE ft.id = $1::uuid AND ft.voided_at IS NULL`,
    [FILL_0908],
  );
  if (f[0]?.load_number !== "13585" || f[0]?.trailer_id || f[0]?.fuel_type !== "reefer_diesel") throw new Error(`REFUSE fill 09-08 ${JSON.stringify(f)}`);
  const d = await q(
    `SELECT e.id::text, e.expense_number, e.voided_at, sum(el.amount_cents)::int cents, count(*)::int n
       FROM accounting.expenses e JOIN accounting.expense_lines el ON el.expense_id = e.id
      WHERE e.id = ANY($1::uuid[]) AND e.operating_company_id = $2::uuid GROUP BY 1,2,3 ORDER BY 2`,
    [[DUP_EXPENSE, KEEP_EXPENSE], USMCA],
  );
  const dup = d.find((r: any) => r.id === DUP_EXPENSE);
  const keep = d.find((r: any) => r.id === KEEP_EXPENSE);
  if (dup?.expense_number !== "13534-28" || dup.voided_at || dup.cents !== 24604 || dup.n !== 1) throw new Error(`REFUSE 13534-28 ${JSON.stringify(d)}`);
  if (keep?.expense_number !== "13523-32" || keep.voided_at || keep.cents !== 27063 || keep.n !== 2) throw new Error(`REFUSE 13523-32 ${JSON.stringify(d)}`);
  const live = await q(
    `SELECT count(*)::int n FROM accounting.journal_entry_postings WHERE id = ANY($1::uuid[]) AND reversed_by_line_id IS NULL AND debit_or_credit = 'debit'`,
    [[...P_A, ...P_B, ...P_C, ...P_D]],
  );
  if (live[0].n !== 12) throw new Error(`REFUSE: expected 12 live debit postings to reclassify, found ${live[0].n}`);

  // STEP 1
  const before = await q(`SELECT * FROM mdata.equipment WHERE id = $1::uuid`, [T10219]);
  const up = await q(
    `UPDATE mdata.equipment SET equipment_type = 'Reefer', updated_by_user_id = $3::uuid
      WHERE id = $1::uuid AND currently_leased_to_company_id = $2::uuid RETURNING equipment_type`,
    [T10219, USMCA, OWNER],
  );
  if (up.length !== 1) throw new Error("REFUSE: 10219 not updated");
  await c.query(`SELECT audit.append_event($1, 'info', $2::jsonb, $3::uuid, $4)`, [
    "fleet.trailer.updated",
    JSON.stringify({ resource_id: T10219, resource_type: "mdata.equipment", operating_company_id: USMCA,
      changes: { equipment_type: { from: before[0].equipment_type, to: "Reefer" } }, reason: "Owner 2026-10-04: 10219 is a reefer" }),
    OWNER, "CC-2-reefer-finish",
  ]);
  out.step1_10219 = up[0].equipment_type;

  // STEP 2
  out.step2_fill_0908 = await setReeferTrailer(c as never, USMCA, { source: "fuel_card", source_id: FILL_0908, trailer_id: T10219 });

  // STEP 3
  const v = await executeVoidCancel("expense", {
    client: c, operatingCompanyId: USMCA, entityId: DUP_EXPENSE, userId: OWNER,
    reason: "Duplicate of receipt 99133290 (Love's Mandeville LA 2026-08-20, reefer $246.04): settlement 5781 prints it once; 13523-32 carries the whole receipt (DEF + reefer) and moves to load 13534. Owner 2026-10-04.",
  } as never);
  if ((v as { kind: string }).kind !== "ok") throw new Error(`void 13534-28: ${JSON.stringify(v)}`);
  out.step3_void_13534_28 = v;

  if (commit) await c.query("COMMIT");
  else await c.query("ROLLBACK");
  await c.end();
} catch (e) {
  await c.query("ROLLBACK").catch(() => {});
  await c.end();
  throw e;
}

// STEP 4 — the reclass engine opens and commits its own transaction per batch; it runs only after steps 1-3 committed.
const allBatches = [
  { name: "A 13523-32 reefer -> load 13534 + 5015", posting_ids: P_A, to_load_id: LOAD_13534, to_account_id: ACCT_5015, phase: 1 },
  { name: "B 13523-32 DEF -> load 13534", posting_ids: P_B, to_load_id: LOAD_13534, phase: 2 },
  { name: "C reefer item lines 5000 -> 5015", posting_ids: P_C, to_account_id: ACCT_5015, phase: 1 },
  { name: "D reefer fuel-card fills -> item Fuel-Reefer-Diesel (5015)", posting_ids: P_D, to_item_id: ITEM_REEFER, phase: 1 },
];
const batches = allBatches.filter((b) => b.phase === phase).map(({ phase: _p, ...b }) => b);
if (commit) {
  const results = [];
  for (const b of batches) {
    const { name, ...rest } = b;
    const r = await applyReclassify(
      { operating_company_id: USMCA, reason: `Owner 2026-10-04 reefer finish — ${name}`, ...rest } as never,
      { userId: OWNER, role: "Owner" },
    );
    results.push({ name, batch_id: (r as any).batch_id, applied: (r as any).lines_applied, refused: (r as any).lines_refused, docs: (r as any).documents });
    if ((r as any).lines_refused) throw new Error(`batch ${name} refused lines: ${JSON.stringify(r)}`);
  }
  out.step4 = results;
} else {
  out.step4_planned = batches.map((b) => ({ name: b.name, postings: b.posting_ids.length }));
}
console.log(`cc2_reefer_finish: ${apply ? "APPLIED" : rehearse ? "REHEARSED (fork, committed)" : "DRY RUN (steps 1-3 rolled back)"}`, JSON.stringify(out));
process.exit(0);
