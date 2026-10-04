// AUTH-398-FUEL (owner, 2026-10-04) — two USMCA fuel corrections, through the app's own wrapper (withLuciaBypass, so the
// after-commit queue is honoured) and the governed void executors. Never a DELETE.
//
// (1) Receipt 99530579 ($510.61) was booked twice: load 13533 (fuel dfb30f22, dated 08-20, expense 63431792) and load
//     13548 (fuel 432798f4, 08-26). Owner: "assign the receipt for the second load" — 13548 keeps it. The 13533 copy is
//     voided: expense -> postVoidReversal + stampDocumentVoided; fuel_transaction -> stampDocumentVoided.
// (2) Four DEF rows carry transaction_reference 'ustFluid' — a slice of "Diesel Exhaust Fluid" the settlement feed
//     invented (fixed in #25351). Their settlement lines (5770, 5794) print no receipt number, so the reference is set
//     to NULL. Amount, load and GL are asserted unchanged.
//
// Dry run (default) ends in a throw, so the wrapper rolls back and the after-commit queue is discarded.
// --apply requires --auth AUTH-NNN, verified OPEN on main by scripts/verify-owner-authorization.mjs.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DUP_FUEL = "dfb30f22-35b2-4375-9d6f-7adedf579469"; // 13533
const DUP_EXPENSE = "63431792-5f13-4b1b-b918-a0feda813ddc";
const KEEP_FUEL = "432798f4-8126-4487-a92e-f1346163881a"; // 13548
const KEEP_EXPENSE = "7ec5b0cb-29f6-4632-a439-f6456e7770ea";
const DEF = [
  "6171784d-9766-4958-bec0-b5c6dbe8dc62",
  "9b2b027e-dfbc-4467-a9d6-f7803a5913d7",
  "24b04710-ceae-48c4-9c80-22fe59b59fd3",
  "0f1bb337-d78c-404a-a50c-68b0bdb8509d",
];
const REASON =
  "Receipt 99530579 ($510.61) booked twice — load 13533 (08-20) and 13548 (08-26). Owner: assign the receipt to the second load (13548). AUTH-398-FUEL, 2026-10-04.";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { executeVoidCancel } = await import("../../apps/backend/src/governance/void-cancel-executors.js");

const snapshot = async (c: any) =>
  (
    await c.query(
      `SELECT ft.id::text fid, ft.transaction_reference ref, round(ft.total_cost * 100)::bigint cents, ft.load_id::text load_id,
              l.load_number, (ft.voided_at IS NOT NULL) ft_void, e.id::text eid, (e.voided_at IS NOT NULL) e_void, e.status,
              e.journal_entry_id::text je,
              (SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0)::bigint
                 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id) je_net,
              (SELECT count(*)::int FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id) je_lines
         FROM fuel.fuel_transactions ft
         LEFT JOIN mdata.loads l ON l.id = ft.load_id
         LEFT JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
        WHERE ft.operating_company_id = $1::uuid AND ft.id = ANY($2::uuid[])
        ORDER BY l.load_number, ft.id`,
      [USMCA, [DUP_FUEL, KEEP_FUEL, ...DEF]],
    )
  ).rows;

let report: unknown;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const before = await snapshot(c);
      const by = (id: string, rows: any[]) => rows.find((r) => r.fid === id);
      const dup = by(DUP_FUEL, before);
      const keep = by(KEEP_FUEL, before);
      if (!dup || !keep || dup.eid !== DUP_EXPENSE || keep.eid !== KEEP_EXPENSE) throw new Error(`REFUSE: rows not as measured ${JSON.stringify(before)}`);
      if (dup.ref !== "99530579" || keep.ref !== "99530579" || Number(dup.cents) !== 51061 || Number(keep.cents) !== 51061)
        throw new Error(`REFUSE: not the same receipt ${JSON.stringify([dup, keep])}`);
      if (dup.load_number !== "13533" || keep.load_number !== "13548") throw new Error(`REFUSE: loads changed ${JSON.stringify([dup, keep])}`);
      if (dup.ft_void || dup.e_void || keep.ft_void || keep.e_void) throw new Error(`REFUSE: a copy is already voided ${JSON.stringify([dup, keep])}`);
      for (const id of DEF) {
        const r = by(id, before);
        if (!r || r.ref !== "ustFluid" || r.ft_void) throw new Error(`REFUSE: DEF row not as measured ${JSON.stringify(r ?? id)}`);
      }

      // (1) void the 13533 copy through the governed executors
      const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, userId: OWNER, reason: REASON });
      const exp = await executeVoidCancel("expense", ctx(DUP_EXPENSE) as never);
      if ((exp as { kind: string }).kind !== "ok") throw new Error(`FINDING: expense void refused ${JSON.stringify(exp)}`);
      const fuel = await executeVoidCancel("fuel_transaction", ctx(DUP_FUEL) as never);
      if ((fuel as { kind: string }).kind !== "ok") throw new Error(`FINDING: fuel void refused ${JSON.stringify(fuel)}`);

      // (2) the invented reference -> NULL (only the reference; nothing else on the row)
      const upd = await c.query(
        `UPDATE fuel.fuel_transactions SET transaction_reference = NULL
          WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND transaction_reference = 'ustFluid'`,
        [USMCA, DEF],
      );
      if (upd.rowCount !== 4) throw new Error(`REFUSE: expected 4 references cleared, got ${upd.rowCount}`);

      const after = await snapshot(c);
      const d = by(DUP_FUEL, after);
      const k = by(KEEP_FUEL, after);
      if (!d.ft_void || !d.e_void || k.ft_void || k.e_void) throw new Error(`REFUSE after: ${JSON.stringify([d, k])}`);
      if (Number(k.je_net) !== Number(by(KEEP_FUEL, before).je_net) || k.load_number !== "13548") throw new Error(`REFUSE: 13548 copy moved`);
      for (const id of DEF) {
        const b = by(id, before);
        const a = by(id, after);
        if (a.ref !== null || a.cents !== b.cents || a.load_id !== b.load_id || a.je !== b.je || a.je_net !== b.je_net || a.je_lines !== b.je_lines || a.e_void)
          throw new Error(`REFUSE: DEF row changed beyond its reference ${JSON.stringify({ b, a })}`);
      }
      const reversal = await c.query(
        `SELECT j.id::text je, count(p.*)::int lines,
                sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE 0 END)::bigint dr,
                sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE 0 END)::bigint cr
           FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id
          WHERE j.operating_company_id = $1::uuid AND j.id = (SELECT reversed_by_je_id FROM accounting.journal_entries WHERE id = $2::uuid)
          GROUP BY j.id`,
        [USMCA, dup.je],
      );
      const live = await c.query(
        `SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_reference = '99530579' AND voided_at IS NULL`,
        [USMCA],
      );
      report = { expense_void: exp, fuel_void: fuel, reversal: reversal.rows, live_copies_of_99530579: live.rows[0].n, def_cleared: upd.rowCount, before, after };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.fuel_auth_398",
          JSON.stringify({ auth_id: authId, owner_ref: "AUTH-398-FUEL", operating_company_id: USMCA, void_fuel: DUP_FUEL, void_expense: DUP_EXPENSE, def_cleared: DEF }),
          `CC-3-${authId}`,
        ]);
      } else {
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`fuel_auth_398: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("fuel_auth_398: DRY RUN (thrown, rolled back, after-commit queue discarded)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("fuel_auth_398: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
