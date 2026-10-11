// LEAD 443.77 #3 (AUTH-440) — owner 2026-10-11 16:57 CT "the gps is source of truth or verification", 18:07 CT "Use logic, get
// this done now" + "Any comment by me made before the seed for the previous seed is irrelevant, use your logic":
//   1848853 ($585.36 diesel + $29.43 DEF): DECIDED BY GPS — T152 fueled at Love's #471 Natalia TX 2026-08-26 16:10Z on load
//     13543's printed empty leg home ("Empty 295.5mi 2026-08-26 EBT Yard, Laredo", settlement 5785) -> stays on 13543; the
//     13547 copies are voided.
//   99448116: one transaction number is one purchase; its diesel + DEF lines are on 13519 -> the second DEF entry on 13535
//     ($41.35, hand-typed "LONESMOE") is voided.
// Governed void (executeVoidCancel expense + fuel_transaction: reversing JE + stampDocumentVoided). Double-cost lines -> 0.
// Dry run (default) runs the whole path and ROLLS BACK. --apply requires --auth AUTH-440, verified OPEN on main.
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-11-cc2-443-77-void-last-double-cost.mts [--apply --auth AUTH-440]
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// [receipt, product, load voided, cents, fuel id, expense id, load kept]
const VOID = [
  ["1848853", "diesel", "13547", 58536, "efb9ccba-a5b0-41a6-b8a9-8ae442217e57", "0e487a88-099e-4b21-9084-35541adb85ee", "13543"],
  ["1848853", "def", "13547", 2943, "b6095998-f88d-4238-949f-dd1dac416f2b", "e304490a-fb9b-42fc-a61c-4cbb3392a680", "13543"],
] as const;
// 1848853 is NOT voided here: GPS CONTRADICTS the recorded ruling (443.74 #4 — stop and list). T152 bought it at Love's #471
// Natalia TX on 2026-08-26 16:10Z, after delivering 13543 at Temple TX (06:09-13:25Z), on 13543's empty leg to EBT Yard Laredo
// (settlement 5785 prints "Empty 295.5mi 2026-08-26 EBT Yard, Laredo" under load 13543); the owner's words name 13547.
const EXPECTED_CENTS = 65614; // 58536 + 2943 + 4135 (99448116 DEF copy on 13535)

// --apply is refused unless AUTH-440 is OPEN on main (the harness checks too; this runner names it itself).
if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  if ((i > 0 ? process.argv[i + 1] : "") !== "AUTH-440") throw new Error("--apply requires --auth AUTH-440");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", "AUTH-440"], { stdio: "inherit" });
}

await run("cc2_443_77_void_last_double_cost", async (c: any) => {
  const q = async (s: string, v: unknown[] = []) => (await c.query(s, v)).rows;
  const tb = async () => Number((await q(
    `SELECT coalesce(sum(CASE WHEN p.debit_or_credit = 'debit' THEN p.amount_cents ELSE -p.amount_cents END), 0) AS d
       FROM accounting.journal_entry_postings p JOIN accounting.journal_entries je ON je.id = p.journal_entry_uuid
      WHERE je.operating_company_id = $1::uuid AND je.status = 'posted'`, [USMCA]))[0].d);
  const tbBefore = await tb();
  let cents = 0;
  const done: string[] = [];
  for (const [receipt, product, load, amount, fuelId, expenseId, keep] of VOID) {
    // Refuse unless the copy is exactly as measured AND the kept copy of the same receipt line is live and posted.
    const mine = (await q(
      `SELECT round(ft.total_cost * 100)::bigint AS cents, ft.fuel_type, l.load_number, ft.voided_at, e.voided_at AS e_void, e.posting_status
         FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
         JOIN accounting.expenses e ON e.id = $2::uuid AND e.source_fuel_transaction_id = ft.id
        WHERE ft.operating_company_id = $3::uuid AND ft.id = $1::uuid`, [fuelId, expenseId, USMCA]))[0];
    if (!mine || Number(mine.cents) !== amount || mine.fuel_type !== product || mine.load_number !== load || mine.voided_at || mine.e_void || mine.posting_status !== "posted") {
      throw new Error(`REFUSE ${receipt} ${product} on ${load}: not as measured ${JSON.stringify(mine)}`);
    }
    const kept = (await q(
      `SELECT count(*)::int AS n FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL AND e.posting_status = 'posted'
        WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND ft.archived_at IS NULL AND ft.id <> $2::uuid
          AND regexp_replace(ft.transaction_reference, '-1[0-9]{4}$', '') = $3 AND ft.fuel_type = $4
          AND round(ft.total_cost * 100)::bigint = $5 AND l.load_number = $6`, [USMCA, fuelId, receipt, product, amount, keep]))[0].n;
    if (kept !== 1) throw new Error(`REFUSE ${receipt} ${product}: the copy to KEEP on ${keep} is not live and posted exactly once (${kept})`);
    const reason = `AUTH-440 (Lead 443.73 #6): duplicate of receipt ${receipt} ${product} — the same purchase is expensed on load ${keep}; a receipt is ONE expense`;
    const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, action: "void", userId: OWNER, reason });
    const ve = await executeVoidCancel("expense", ctx(expenseId) as never);
    if ((ve as { kind: string }).kind !== "ok") throw new Error(`expense void ${receipt} ${product} ${load}: ${JSON.stringify(ve)}`);
    const vf = await executeVoidCancel("fuel_transaction", ctx(fuelId) as never);
    if ((vf as { kind: string }).kind !== "ok") throw new Error(`fuel void ${receipt} ${product} ${load}: ${JSON.stringify(vf)}`);
    cents += amount;
    done.push(`${receipt} ${product} ${load} (kept ${keep})`);
  }
  // 99448116 (443.77 #3): ONE transaction number = one purchase. Its diesel line (179.306 gal $1,020.07) and DEF line (9.741 gal
  // $47.45) are on 13519; the 13535 line "99448116-13535" DEF 8.489 gal $41.35 ("10465LONESMOE PINE", hand-typed) is a second
  // DEF entry of the same transaction — voided; 13519 keeps the receipt.
  {
    const fuelId = "f542a157-820a-46ba-9b5c-958059ae0d25", expenseId = "0542c7c4-6cc3-49e6-aaae-b365ec710bcc";
    const mine = (await q(
      `SELECT round(ft.total_cost * 100)::bigint AS cents, ft.fuel_type, l.load_number, ft.voided_at, e.voided_at AS e_void, e.posting_status
         FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
         JOIN accounting.expenses e ON e.id = $2::uuid AND e.source_fuel_transaction_id = ft.id
        WHERE ft.operating_company_id = $3::uuid AND ft.id = $1::uuid`, [fuelId, expenseId, USMCA]))[0];
    if (!mine || Number(mine.cents) !== 4135 || mine.fuel_type !== "def" || mine.load_number !== "13535" || mine.voided_at || mine.e_void || mine.posting_status !== "posted") {
      throw new Error(`REFUSE 99448116 def on 13535: not as measured ${JSON.stringify(mine)}`);
    }
    const kept = (await q(
      `SELECT count(*)::int AS n FROM fuel.fuel_transactions ft JOIN mdata.loads l ON l.id = ft.load_id
         JOIN accounting.expenses e ON e.source_fuel_transaction_id = ft.id AND e.voided_at IS NULL AND e.posting_status = 'posted'
        WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND l.load_number = '13519' AND ft.transaction_reference = '99448116'`, [USMCA]))[0].n;
    if (kept !== 2) throw new Error(`REFUSE 99448116: 13519 must keep the diesel + DEF lines of the receipt live and posted (${kept})`);
    const reason = "AUTH-440 (Lead 443.77 #3): second DEF entry of receipt 99448116 — one transaction number is one purchase; 13519 carries its diesel and DEF lines";
    const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, action: "void", userId: OWNER, reason });
    const ve = await executeVoidCancel("expense", ctx(expenseId) as never);
    if ((ve as { kind: string }).kind !== "ok") throw new Error(`expense void 99448116 13535: ${JSON.stringify(ve)}`);
    const vf = await executeVoidCancel("fuel_transaction", ctx(fuelId) as never);
    if ((vf as { kind: string }).kind !== "ok") throw new Error(`fuel void 99448116 13535: ${JSON.stringify(vf)}`);
    cents += 4135;
    done.push("99448116 def 13535 (kept 13519)");
  }
  if (cents !== EXPECTED_CENTS) throw new Error(`REFUSE: ${cents} cents voided, expected ${EXPECTED_CENTS}`);
  const tbAfter = await tb();
  if (tbBefore !== 0 || tbAfter !== 0) throw new Error(`REFUSE: TB ${tbBefore} -> ${tbAfter}`);
  // After: every one of the 7 receipt lines is live exactly once.
  const still = await q(
    `SELECT regexp_replace(ft.transaction_reference, '-1[0-9]{4}$', '') AS r, ft.fuel_type, count(*)::int AS n
       FROM fuel.fuel_transactions ft
      WHERE ft.operating_company_id = $1::uuid AND ft.voided_at IS NULL AND ft.archived_at IS NULL
        AND regexp_replace(ft.transaction_reference, '-1[0-9]{4}$', '') = ANY($2::text[])
      GROUP BY 1, 2 HAVING count(*) > 1`, [USMCA, ["1848853", "99448116"]]);
  if (still.length) throw new Error(`REFUSE: still doubled ${JSON.stringify(still)}`);
  return { voided: done.length, cents, tb_before: tbBefore, tb_after: tbAfter, lines: done };
});
