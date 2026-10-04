// Owner chat 2026-10-04: "IT BELONGS TO THE SECOND LOAD, 547". Love's Natalia TX receipt 1848853 (2026-08-26, T152,
// 105.489 gal, $585.36) was fed twice: on load 13543 (settlement doc 5785, Albertville AL 08-24 -> Temple TX 08-26) and on
// load 13547 (doc 5792, Laredo TX 08-26 -> Chicago IL 08-28). Natalia sits on I-35 between Temple and Laredo: the fill is
// the empty run to 13547's pickup, and the owner assigned it to 13547. The copy on 13543 is the duplicate: expense 13543-9
// (98ad3749) and fuel transaction 73caf437. Both are voided through the governed void executors (REVERSE -> VOID:
// postVoidReversal + stampDocumentVoided), never a hand-written UPDATE. The 13547 copy (expense 13547, fuel 737e377b) is
// kept and asserted live after. Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // primary owner (authorized in chat 2026-10-04)
const DUP_EXPENSE = "98ad3749-fb8f-4a40-b5b6-1197f6bc0bbf"; // 13543-9
const DUP_FUEL = "73caf437-6e58-4ee9-b6dc-4538f50c34cf";
const KEEP_EXPENSE = "4d7fa3bc-42b4-455f-ace9-3515169a022a"; // 13547
const KEEP_FUEL = "737e377b-df73-41d8-9648-ebb9027a524a";
const REASON = "Duplicate fuel receipt 1848853 (2026-08-26, T152, $585.36) — fed on load 13543 and 13547; the owner assigned the fill to 13547 (empty run Temple -> Laredo pickup). Owner authorized 2026-10-04.";

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("cc2_void_duplicate_fuel_1848853", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const pre = await q(
    `SELECT ft.id::text fid, ft.transaction_reference ref, round(ft.total_cost * 100)::bigint cents, ft.voided_at, l.load_number, e.id::text eid, e.voided_at e_voided
       FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
       JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
      WHERE ft.operating_company_id = $1::uuid AND ft.id = ANY($2::uuid[]) ORDER BY l.load_number`,
    [USMCA, [DUP_FUEL, KEEP_FUEL]],
  );
  const dup = pre.find((r: any) => r.fid === DUP_FUEL);
  const keep = pre.find((r: any) => r.fid === KEEP_FUEL);
  if (!dup || !keep || dup.eid !== DUP_EXPENSE || keep.eid !== KEEP_EXPENSE) throw new Error(`REFUSE: rows not as measured ${JSON.stringify(pre)}`);
  if (dup.ref !== "1848853" || keep.ref !== "1848853" || Number(dup.cents) !== 58536 || Number(keep.cents) !== 58536) throw new Error(`REFUSE: not the same receipt ${JSON.stringify(pre)}`);
  if (dup.load_number !== "13543" || keep.load_number !== "13547") throw new Error(`REFUSE: loads changed ${JSON.stringify(pre)}`);
  if (dup.voided_at || dup.e_voided || keep.voided_at || keep.e_voided) throw new Error(`REFUSE: a copy is already voided ${JSON.stringify(pre)}`);

  const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, userId: OWNER, reason: REASON });
  const exp = await executeVoidCancel("expense", ctx(DUP_EXPENSE) as never);
  if ((exp as { kind: string }).kind !== "ok") throw new Error(`expense void: ${JSON.stringify(exp)}`);
  const fuel = await executeVoidCancel("fuel_transaction", ctx(DUP_FUEL) as never);
  if ((fuel as { kind: string }).kind !== "ok") throw new Error(`fuel void: ${JSON.stringify(fuel)}`);

  const post = await q(
    `SELECT ft.id::text fid, (ft.voided_at IS NOT NULL) ft_void, (e.voided_at IS NOT NULL) e_void, e.status
       FROM fuel.fuel_transactions ft JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id
      WHERE ft.id = ANY($1::uuid[]) ORDER BY 1`,
    [[DUP_FUEL, KEEP_FUEL]],
  );
  const d = post.find((r: any) => r.fid === DUP_FUEL);
  const k = post.find((r: any) => r.fid === KEEP_FUEL);
  if (!d?.ft_void || !d?.e_void || k?.ft_void || k?.e_void) throw new Error(`REFUSE after: ${JSON.stringify(post)}`);
  const live = await q(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_reference = '1848853' AND voided_at IS NULL`, [USMCA]);
  return { expense_void: exp, fuel_void: fuel, live_copies_of_1848853: live[0].n, after: post };
});
