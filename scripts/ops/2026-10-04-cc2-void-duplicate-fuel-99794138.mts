// ROUND 393.2 (Lead) + owner chat 2026-10-04 ("YES VOID DUPLICATES"): Relay/Loves receipt 99794138 (2026-08-31, T177,
// 179.923 gal, $1,005.59) was fed twice — once on load 13557 (settlement doc 5789) and once on load 13571 (doc 5799).
// The fill is dated 2026-08-31: load 13557 runs 2026-08-28 -> 2026-08-31 and contains it; 13571 starts 2026-09-01.
// The copy on 13571 is the duplicate: expense 13571-5 (c0aa22b4) and fuel transaction e8415607. Both are voided through
// the governed void executors (REVERSE -> VOID: postVoidReversal + stampDocumentVoided), never a hand-written UPDATE.
// The 13557 copy (expense 13557-7, fuel 152e088a) is kept and asserted live after.
// 1848853 is NOT touched: its fill date (2026-08-26) is the boundary day of 13543 and 13547 — the owner decides the load.
// Dry run (default) rolls back. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd"; // primary owner (authorized in chat 2026-10-04)
const DUP_EXPENSE = "c0aa22b4-720c-43fb-bd92-3c003ed7267d"; // 13571-5
const DUP_FUEL = "e8415607-1c03-4b70-98d0-370c4e1ca9e1";
const KEEP_EXPENSE = "6cf69a27-2a6c-49d9-884d-f78200c39b45"; // 13557-7
const KEEP_FUEL = "152e088a-29c3-46a7-8191-883deb76495d";
const REASON = "Duplicate fuel receipt 99794138 (2026-08-31, T177, $1,005.59) — fed on load 13571 and 13557; the fill belongs to 13557 (2026-08-28 to 2026-08-31). Owner authorized 2026-10-04.";

if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", i > 0 ? process.argv[i + 1] : "AUTH-MISSING"], { stdio: "inherit" });
}

await run("cc2_void_duplicate_fuel_99794138", async (c: any) => {
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
  if (dup.ref !== "99794138" || keep.ref !== "99794138" || Number(dup.cents) !== 100559 || Number(keep.cents) !== 100559) throw new Error(`REFUSE: not the same receipt ${JSON.stringify(pre)}`);
  if (dup.load_number !== "13571" || keep.load_number !== "13557") throw new Error(`REFUSE: loads changed ${JSON.stringify(pre)}`);
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
  const live = await q(`SELECT count(*)::int n FROM fuel.fuel_transactions WHERE operating_company_id = $1::uuid AND transaction_reference = '99794138' AND voided_at IS NULL`, [USMCA]);
  return { expense_void: exp, fuel_void: fuel, live_copies_of_99794138: live[0].n, after: post };
});
