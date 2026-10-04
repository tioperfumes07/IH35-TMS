// AUTH-215 (owner standing order 2026-10-04: "SO I FOLLOW YOUR RECOMMENDATIONS … ALWAYS FIX"). Six DEF purchases put back
// on what the SIGNED settlements print (Company_Settlement_5770 / 5794) — date, receipt, load, location — through the engine.
//
// Measured on USMCA: the settlement feed put 5770's three DEF rows on 13509 dated 08-10 and 5794's 30.30 on 13568 dated
// 09-03, all with no receipt (writer fixed #25389 / #25391); and R145 separately booked 5770's three DEF as load-less
// expenses — the same three purchases COUNTED TWICE ($105.05) — plus 5794's 17.99 / 17.29 as expenses with no fuel row.
//
// VOID (governed executors — expense: postVoidReversal + stamp; fuel_transaction: stamp):
//   fuel-born  6171784d/fba11ce4 · 9b2b027e/63e5e36a · 24b04710/fe0ff50d · 0f1bb337/12a35045
//   R145       f267f1f1 (30.71) · 1c08aa97 (37.10) · ef97d3af (37.24) · 480660cc (17.99) · a2652a87 (17.29)
// CREATE (the feed's own insert + postFuelExpenseOnClient, company_direct — exactly what a re-feed would write, same
//   source_row_hash, so a later re-feed of these days is a no-op):
//   13503 08-05 30.71 #99301244 · 13503 08-06 37.10 #99442334 · 13509 08-09 37.24 #99444239
//   13558 08-29 30.30 #2885954 · 13558 08-29 17.99 #99602755 · 13558 08-30 17.29 #99912182
// Driver / unit / vendor: from the same-ticket diesel row on that load (b5124f36 / 9c98b123 on 13503, 66f765d3 / e0c667fe on
// 13558) or the load's own rows (13509: a8121afb). Untouched: 5800's 30.30 (receipt 2885953 — a different purchase).
// Dry run (default) ends in a throw inside withLuciaBypass. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const LOVES = "5a529e97-5af6-4874-89c0-f300715101f2";
const L13503 = "2c2d9ae7-386d-4ede-9c8f-888bce2896d7";
const L13509 = "c516a904-fdb7-4a85-8626-ef1fba5c0151";
const L13558 = "32e31e0c-ca8b-4fda-9ca3-16ef23bb2b37";
const NEFTALI = { driver: "a32a35c8-7cd5-4368-83f0-35e185092433", unit: "f439def3-05ac-42cf-829b-2b66ecf85a32" };
const JOSE = { driver: "45fac397-860e-4fe8-ae18-67e12e1959c1", unit: "033dcdff-98c7-4b2e-8db3-2c94519dbc89" };

const VOID_FUEL = [
  { fuel: "6171784d-9766-4958-bec0-b5c6dbe8dc62", expense: "fba11ce4-625e-47b6-ad00-e9d31aced24b", cents: 3071 },
  { fuel: "9b2b027e-dfbc-4467-a9d6-f7803a5913d7", expense: "63e5e36a-4937-4e36-bdae-aae037d12c03", cents: 3710 },
  { fuel: "24b04710-ceae-48c4-9c80-22fe59b59fd3", expense: "fe0ff50d-d4b4-49b6-b38f-5cc170bbe478", cents: 3724 },
  { fuel: "0f1bb337-d78c-404a-a50c-68b0bdb8509d", expense: "12a35045-f17e-4322-992c-5171abce0c18", cents: 3030 },
];
const VOID_R145 = [
  { prefix: "f267f1f1", cents: 3071, date: "2026-08-05" },
  { prefix: "1c08aa97", cents: 3710, date: "2026-08-06" },
  { prefix: "ef97d3af", cents: 3724, date: "2026-08-09" },
  { prefix: "480660cc", cents: 1799, date: "2026-08-29" },
  { prefix: "a2652a87", cents: 1729, date: "2026-08-30" },
];
const CREATE = [
  { load: L13503, ln: "13503", date: "2026-08-05", cents: 3071, receipt: "99301244", loc: "900SEAGLE STWEIMAR,TX", fi: 4, hk: "ustFluid", who: NEFTALI },
  { load: L13503, ln: "13503", date: "2026-08-06", cents: 3710, receipt: "99442334", loc: "10465LONESOME PINE TRAIL M,TN", fi: 5, hk: "ustFluid", who: NEFTALI },
  { load: L13509, ln: "13509", date: "2026-08-09", cents: 3724, receipt: "99444239", loc: "10465LONESOME PINE TRAIL M,TN", fi: 3, hk: "ustFluid", who: NEFTALI },
  { load: L13558, ln: "13558", date: "2026-08-29", cents: 3030, receipt: "2885954", loc: "21548FM471SNATALIA,TX", fi: 5, hk: "tFuelDef", who: JOSE },
  { load: L13558, ln: "13558", date: "2026-08-29", cents: 1799, receipt: "99602755", loc: "2024A WEST STREET VINTON,LA", fi: 3, hk: "ustFluid", who: JOSE },
  { load: L13558, ln: "13558", date: "2026-08-30", cents: 1729, receipt: "99912182", loc: "1624BEAR CREEKPIKE COLUMBIA TN", fi: 4, hk: "ustFluid", who: JOSE },
];
const REASON = "DEF purchase on the wrong load/date or booked twice — re-created from the signed settlement (5770 / 5794): date, receipt, load. AUTH-215, 2026-10-04.";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.js");
const { postFuelExpenseOnClient } = await import("../../apps/backend/src/accounting/fuel-posting/poster.service.js");
const { createExpenseFromFuelTransaction } = await import("../../apps/backend/src/fuel/fuel-expense-document.service.js");

const defCostOnLoads = async (c: any) =>
  (
    await c.query(
      `SELECT coalesce(sum(e.total_amount_cents), 0)::bigint cents, count(*)::int n
         FROM accounting.expenses e
        WHERE e.operating_company_id = $1::uuid AND e.voided_at IS NULL AND e.status = 'posted'
          AND e.total_amount_cents = ANY($2::bigint[])
          AND e.transaction_date BETWEEN '2026-08-01' AND '2026-09-10'
          AND (e.memo ILIKE '%DEF%' OR e.memo ILIKE '%Diesel Exhaust%')
          AND NOT (e.memo LIKE 'R145 SETTL 5800 %')`,
      [USMCA, [3071, 3710, 3724, 3030, 1799, 1729]],
    )
  ).rows[0];

let report: any;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const before = await defCostOnLoads(c);

      // preconditions — every row exactly as measured, live
      for (const v of VOID_FUEL) {
        const r = (
          await c.query(
            `SELECT round(ft.total_cost * 100)::bigint cents, ft.voided_at, e.id::text eid, e.voided_at ev
               FROM fuel.fuel_transactions ft JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
              WHERE ft.operating_company_id = $1::uuid AND ft.id = $2::uuid`,
            [USMCA, v.fuel],
          )
        ).rows[0];
        if (!r || r.eid !== v.expense || Number(r.cents) !== v.cents || r.voided_at || r.ev) throw new Error(`REFUSE: fuel ${v.fuel} not as measured ${JSON.stringify(r)}`);
      }
      const r145: { id: string; prefix: string }[] = [];
      for (const v of VOID_R145) {
        const r = (
          await c.query(
            `SELECT id::text FROM accounting.expenses
              WHERE operating_company_id = $1::uuid AND id::text LIKE $2 AND total_amount_cents = $3 AND transaction_date = $4::date
                AND memo LIKE 'R145 SETTL %' AND voided_at IS NULL AND source_fuel_transaction_id IS NULL`,
            [USMCA, `${v.prefix}%`, v.cents, v.date],
          )
        ).rows;
        if (r.length !== 1) throw new Error(`REFUSE: R145 ${v.prefix} not as measured (${r.length})`);
        r145.push({ id: r[0].id, prefix: v.prefix });
      }
      for (const n of CREATE) {
        const dup = (
          await c.query(
            `SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_reference = $2 AND fuel_type = 'def' AND voided_at IS NULL`,
            [USMCA, n.receipt],
          )
        ).rows[0].n;
        if (dup) throw new Error(`REFUSE: a live DEF row already carries receipt ${n.receipt}`);
      }

      const voided: unknown[] = [];
      const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, userId: OWNER, reason: REASON });
      for (const v of VOID_FUEL) {
        const e = await executeVoidCancel("expense", ctx(v.expense) as never);
        if ((e as { kind: string }).kind !== "ok") throw new Error(`FINDING: expense void refused ${v.expense}: ${JSON.stringify(e)}`);
        const f = await executeVoidCancel("fuel_transaction", ctx(v.fuel) as never);
        if ((f as { kind: string }).kind !== "ok") throw new Error(`FINDING: fuel void refused ${v.fuel}: ${JSON.stringify(f)}`);
        voided.push({ fuel: v.fuel.slice(0, 8), expense: v.expense.slice(0, 8), reversal: (e as any).reversing_entry_ref ?? null });
      }
      for (const v of r145) {
        const e = await executeVoidCancel("expense", ctx(v.id) as never);
        if ((e as { kind: string }).kind !== "ok") throw new Error(`FINDING: R145 expense void refused ${v.id}: ${JSON.stringify(e)}`);
        voided.push({ r145: v.prefix, reversal: (e as any).reversing_entry_ref ?? null });
      }

      const created: unknown[] = [];
      for (const n of CREATE) {
        const hash = `alwaystrack-settl:${USMCA}:${n.load}:def:${n.fi}:${n.cents}:${n.hk}`;
        const ins = await c.query(
          `INSERT INTO fuel.fuel_transactions (
             operating_company_id, transaction_at, purchased_at, load_id, vendor_id, fuel_type,
             gallons, total_cost, location_city, transaction_reference, source, source_row_hash,
             created_by_user_id, updated_by_user_id, driver_id, unit_id
           ) VALUES ($1::uuid, $2::date, $2::date, $3::uuid, $4::uuid, 'def', 1, $5, $6, $7, 'import', $8, $9::uuid, $9::uuid, $10::uuid, $11::uuid)
           RETURNING id::text`,
          [USMCA, n.date, n.load, LOVES, n.cents / 100, n.loc, n.receipt, hash, OWNER, n.who.driver, n.who.unit],
        );
        const fuelId = ins.rows[0].id;
        const posted = await postFuelExpenseOnClient(c, {
          operating_company_id: USMCA,
          actor_user_id: OWNER,
          fuel_event_id: fuelId,
          fuel_kind: "def",
          posted_at: n.date,
          amount_cents: n.cents,
          posting_path: "company_direct",
        } as never);
        // ROUND 290.1 canonical rule: a fuel row and its expense document are created in the same operation; the
        // document adopts the journal entry the poster just wrote.
        const doc = await createExpenseFromFuelTransaction(c, { operating_company_id: USMCA, fuel_transaction_id: fuelId, requesting_user_uuid: OWNER } as never);
        if ((doc as { outcome: string }).outcome !== "created" || (doc as any).adopted_journal_entry_id !== (posted as any).journal_entry_id)
          throw new Error(`FINDING: expense document for ${n.receipt} not created on the posted JE ${JSON.stringify({ doc, je: (posted as any).journal_entry_id })}`);
        const exp = (
          await c.query(
            `SELECT e.id::text, e.transaction_date::text d, e.total_amount_cents c, e.journal_entry_id::text je,
                    (SELECT string_agg(DISTINCT (SELECT load_number FROM mdata.loads l WHERE l.id = el.load_id), ',') FROM accounting.expense_lines el WHERE el.expense_id = e.id) loads
               FROM accounting.expenses e WHERE e.source_fuel_transaction_id = $1::uuid AND e.voided_at IS NULL`,
            [fuelId],
          )
        ).rows[0];
        if (!exp || Number(exp.c) !== n.cents || exp.d !== n.date || !exp.je) throw new Error(`REFUSE: posting for ${n.receipt} not as expected ${JSON.stringify({ posted, exp })}`);
        created.push({ receipt: n.receipt, load: n.ln, date: n.date, cents: n.cents, fuel: fuelId.slice(0, 8), expense: exp.id.slice(0, 8), je: exp.je.slice(0, 8), expense_loads: exp.loads });
      }

      const after = await defCostOnLoads(c);
      const removed = Number(before.cents) - Number(after.cents);
      if (removed !== 3071 + 3710 + 3724) throw new Error(`REFUSE: expected the $105.05 double to leave the books, moved ${removed}`);
      report = { voided, created, def_cost_before: before, def_cost_after: after, double_removed_cents: removed };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.def_rows_to_signed_source",
          JSON.stringify({ auth_id: authId, operating_company_id: USMCA, voided, created }),
          `CC-3-${authId}`,
        ]);
      } else {
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`def_rows_to_signed_source: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("def_rows_to_signed_source: DRY RUN (thrown, rolled back)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("def_rows_to_signed_source: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
