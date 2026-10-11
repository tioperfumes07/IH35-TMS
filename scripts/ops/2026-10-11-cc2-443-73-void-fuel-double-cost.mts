// LEAD 443.73 item 6 (a)+(b), AUTH-439 — the same fuel purchase is expensed TWICE (both copies posted Dr fuel / Cr 2510
// Dreamline) after the AUTH-400 clean slate re-fed each receipt from both settlement documents that print it. A receipt is
// ONE expense. This voids the second copy of 7 receipt lines ($2,291.25) through the governed void executors
// (executeVoidCancel: postVoidReversal + stampDocumentVoided — REVERSE -> VOID), never a hand-written UPDATE; phase 2
// (the owner's 2026-10-02 complete-delete law) then removes the voided copies with their reversal pairs through the
// complete-delete engine, which refuses any document that still has live GL.
//
// Which copy stays — the owner's words (2026-10-04, recorded under AUTH-207 / AUTH-209 / AUTH-398):
//   99794138 ($1,005.59 diesel + $70.61 DEF): keep load 13557, void the 13571 copies  ("YES VOID DUPLICTATS" ... "YES I AUTHOROIZE YOU")
//   99530579 ($510.61 diesel):                keep load 13548, void the 13533 copy    ("FUEL AUTH: BOTH AUTHORIZED")
// And the Lead's 443.73 6(b): 99416535 / 99477699 — the receipt's diesel is on 13604 only, so its DEF line belongs with it:
//   void the 13615 DEF copies ($45.90 + $43.75).
// 99549122 (13603 / 13621, $614.96): decided by GPS (443.74 #4) — keep 13603, void the 13621 copies.
// 1848853: NOT touched — GPS contradicts the recorded ruling; listed for the owner (see below).
//
// Dry run (default) runs the whole void path and ROLLS BACK. --apply requires --auth AUTH-439, verified OPEN on main.
// Run: node --env-file=<env> --import tsx scripts/ops/2026-10-11-cc2-443-73-void-fuel-double-cost.mts [--apply --auth AUTH-439]
import { execFileSync } from "node:child_process";
import { run, USMCA } from "./2026-10-01-cc3-lib.mjs";
import { executeVoidCancel } from "../../apps/backend/src/governance/void-cancel-executors.js";

const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
// [receipt, product, load voided, cents, fuel id, expense id, load kept]
const VOID = [
  ["99794138", "diesel", "13571", 100559, "2d53888f-9d35-44f5-90d7-34843ec63925", "93fd43f3-659f-41a2-b87a-8815dd96abf7", "13557"],
  ["99794138", "def", "13571", 7061, "4478f31d-2232-4b24-beec-04a58fee62d9", "82d88611-5c77-44cc-aaca-54dee8161578", "13557"],
  ["99530579", "diesel", "13533", 51061, "6779ab91-dada-4a8f-99fd-2546677e4d5a", "8701c5da-2ce5-4403-a81e-370daa0538b2", "13548"],
  ["99416535", "def", "13615", 4590, "3a054214-04f9-428a-ac90-6211546d4f0f", "78bffd5e-7c7f-4a1b-ac16-f71a5cd19ffd", "13604"],
  ["99477699", "def", "13615", 4375, "2d4f677b-ad18-46ed-8e65-b3d1fc175d1a", "c381d34b-16ba-4c7c-82a1-2e93b9df0af1", "13604"],
  // 443.74 #4 (owner: "Probably the gps is source of truth or verification"): T175 bought it at Love's #471 Natalia TX on
  // 2026-09-20 01:29Z, on 13603's empty leg Bryan TX -> EBT Yard Laredo (settlement 5811 prints "Empty 308.4mi 2026-09-21
  // EBT Yard, Laredo" under load 13603); 13621 picks up in Laredo on 09-22.
  ["99549122", "diesel", "13621", 59245, "5ac73acf-9d8b-4a68-8cdc-b8084799410d", "26dfdd6d-2746-4bc2-88f1-749019b1e14d", "13603"],
  ["99549122", "def", "13621", 2251, "57da823d-a912-441a-84a4-599a49c450d8", "8caa8e0e-6f6b-4c22-bb16-bffd312b911e", "13603"],
] as const;
// 1848853 is NOT voided here: GPS CONTRADICTS the recorded ruling (443.74 #4 — stop and list). T152 bought it at Love's #471
// Natalia TX on 2026-08-26 16:10Z, after delivering 13543 at Temple TX (06:09-13:25Z), on 13543's empty leg to EBT Yard Laredo
// (settlement 5785 prints "Empty 295.5mi 2026-08-26 EBT Yard, Laredo" under load 13543); the owner's words name 13547.
const EXPECTED_CENTS = 229142;

// --apply is refused unless AUTH-439 is OPEN on main (the harness checks too; this runner names it itself).
if (process.argv.includes("--apply")) {
  const i = process.argv.indexOf("--auth");
  if ((i > 0 ? process.argv[i + 1] : "") !== "AUTH-439") throw new Error("--apply requires --auth AUTH-439");
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", "AUTH-439"], { stdio: "inherit" });
}

await run("cc2_443_73_void_fuel_double_cost", async (c: any) => {
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
    const reason = `AUTH-439 (Lead 443.73 #6): duplicate of receipt ${receipt} ${product} — the same purchase is expensed on load ${keep}; a receipt is ONE expense`;
    const ctx = (entityId: string) => ({ client: c, operatingCompanyId: USMCA, entityId, action: "void", userId: OWNER, reason });
    const ve = await executeVoidCancel("expense", ctx(expenseId) as never);
    if ((ve as { kind: string }).kind !== "ok") throw new Error(`expense void ${receipt} ${product} ${load}: ${JSON.stringify(ve)}`);
    const vf = await executeVoidCancel("fuel_transaction", ctx(fuelId) as never);
    if ((vf as { kind: string }).kind !== "ok") throw new Error(`fuel void ${receipt} ${product} ${load}: ${JSON.stringify(vf)}`);
    cents += amount;
    done.push(`${receipt} ${product} ${load} (kept ${keep})`);
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
      GROUP BY 1, 2 HAVING count(*) > 1`, [USMCA, ["99794138", "99530579", "99416535", "99477699", "99549122"]]);
  if (still.length) throw new Error(`REFUSE: still doubled ${JSON.stringify(still)}`);
  return { voided: done.length, cents, tb_before: tbBefore, tb_after: tbAfter, lines: done };
});
