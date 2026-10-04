// Owner AUTH-398-FUEL-MEMO + AUTH-398-ISSUER (2026-10-04), USMCA only, inside withLuciaBypass.
// (1) Four DEF expenses carry the invented receipt "ref ustFluid" in their memo (the settlement feed sliced it from
//     "Diesel Exhaust Fluid"; writer fixed #25351, fuel references cleared under AUTH-212). The source settlement lines
//     print no receipt number, so ", ref ustFluid" is removed. Memo text only — amount, date, GL asserted unchanged.
// (2) DREAMLINE card type -> issuer Dreamline Transit LLC, through setFuelCardTypeIssuer (the /fuel/cards service) with
//     the same fuel.card_type.issuer_set audit the route writes. Measured: 68 live fills ($44,120) on the card and 25 Zelle
//     payments ($173,000) to Dreamline Transit LLC. RELAY stays blank (no fill stamped to it) — not touched.
// Dry run (default) ends in a throw. --apply requires --auth AUTH-NNN, verified OPEN on main.
import { execFileSync } from "node:child_process";

const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const OWNER = "e4117991-d2c0-406d-8cda-74e98d95bccd";
const DEF_EXPENSES = [
  "fba11ce4-625e-47b6-ad00-e9d31aced24b",
  "63e5e36a-4937-4e36-bdae-aae037d12c03",
  "fe0ff50d-d4b4-49b6-b38f-5cc170bbe478",
  "12a35045-f17e-4322-992c-5171abce0c18",
];
const DREAMLINE_CARD_TYPE = "0fd4a1a8-6192-4f0f-b769-efe480d150ce";
const DREAMLINE_VENDOR = "3e72d4a5-e6e7-497a-932e-2d3062502be2";
const RELAY_CARD_TYPE = "7d165efc-d587-4462-af47-803d885637b2";

const apply = process.argv.includes("--apply");
let authId: string | null = null;
if (apply) {
  const i = process.argv.indexOf("--auth");
  authId = i > 0 ? process.argv[i + 1] : "AUTH-MISSING";
  execFileSync("node", ["scripts/verify-owner-authorization.mjs", authId], { stdio: "inherit" });
}

const { withLuciaBypass } = await import("../../apps/backend/src/auth/db.js");
const { setFuelCardTypeIssuer } = await import("../../apps/backend/src/fuel/fuel-card-assignments.service.js");
const { appendCrudAudit } = await import("../../apps/backend/src/audit/crud-audit.js");

const snap = async (c: any) =>
  (
    await c.query(
      `SELECT e.id::text id, e.memo, e.total_amount_cents::text amt, e.transaction_date::text d, e.journal_entry_id::text je,
              (SELECT string_agg(p.account_id::text || ':' || p.debit_or_credit || ':' || p.amount_cents, ',' ORDER BY p.id)
                 FROM accounting.journal_entry_postings p WHERE p.journal_entry_uuid = e.journal_entry_id) gl
         FROM accounting.expenses e WHERE e.operating_company_id = $1::uuid AND e.id = ANY($2::uuid[]) ORDER BY 1`,
      [USMCA, DEF_EXPENSES],
    )
  ).rows;

let report: unknown;
try {
  await withLuciaBypass(
    async (c: any) => {
      await c.query("SELECT set_config('app.operating_company_id', $1, true)", [USMCA]);
      const before = await snap(c);
      if (before.length !== 4 || before.some((r: any) => !r.memo.includes(", ref ustFluid"))) throw new Error(`REFUSE: memos not as measured ${JSON.stringify(before)}`);
      const upd = await c.query(
        `UPDATE accounting.expenses SET memo = replace(memo, ', ref ustFluid', ''), updated_at = now()
          WHERE operating_company_id = $1::uuid AND id = ANY($2::uuid[]) AND memo LIKE '%, ref ustFluid%'`,
        [USMCA, DEF_EXPENSES],
      );
      if (upd.rowCount !== 4) throw new Error(`REFUSE: expected 4 memos, got ${upd.rowCount}`);
      const after = await snap(c);
      for (const b of before) {
        const a = after.find((x: any) => x.id === b.id);
        if (!a || a.memo.includes("ustFluid") || a.amt !== b.amt || a.d !== b.d || a.je !== b.je || a.gl !== b.gl)
          throw new Error(`REFUSE: expense changed beyond its memo ${JSON.stringify({ b, a })}`);
      }

      const relayBefore = (await c.query(`SELECT issuer_vendor_id::text v FROM catalogs.fuel_card_types WHERE id = $1::uuid`, [RELAY_CARD_TYPE])).rows[0]?.v ?? null;
      const { before: issuerBefore, after: issuerAfter } = await setFuelCardTypeIssuer(c, USMCA, DREAMLINE_CARD_TYPE, DREAMLINE_VENDOR);
      if (issuerBefore !== null || issuerAfter.issuer_vendor_id !== DREAMLINE_VENDOR) throw new Error(`REFUSE: issuer ${issuerBefore} -> ${issuerAfter.issuer_vendor_id}`);
      await appendCrudAudit(c, OWNER, "fuel.card_type.issuer_set", {
        operating_company_id: USMCA,
        fuel_card_type_id: DREAMLINE_CARD_TYPE,
        before_issuer_vendor_id: issuerBefore,
        after_issuer_vendor_id: issuerAfter.issuer_vendor_id,
      });
      const relayAfter = (await c.query(`SELECT issuer_vendor_id::text v FROM catalogs.fuel_card_types WHERE id = $1::uuid`, [RELAY_CARD_TYPE])).rows[0]?.v ?? null;
      if (relayBefore !== null || relayAfter !== null) throw new Error(`REFUSE: RELAY issuer must stay blank (${relayBefore} -> ${relayAfter})`);

      report = { memos_cleared: upd.rowCount, memos_after: after.map((a: any) => ({ id: a.id.slice(0, 8), memo: a.memo.slice(0, 70) })), dreamline_issuer: issuerAfter, relay_issuer: relayAfter };
      if (apply) {
        await c.query("SELECT audit.append_event($1,'info',$2::jsonb,NULL,$3)", [
          "cc3.def_memos_and_dreamline_issuer",
          JSON.stringify({ auth_id: authId, operating_company_id: USMCA, memos: DEF_EXPENSES, dreamline_issuer: DREAMLINE_VENDOR }),
          `CC-3-${authId}`,
        ]);
      } else {
        throw new Error("PROOF_ROLLBACK");
      }
    },
    { actorUserId: OWNER },
  );
  console.log(`def_memos_and_dreamline_issuer: APPLIED under ${authId}`);
  console.log(JSON.stringify(report, null, 1));
} catch (e) {
  if ((e as Error).message === "PROOF_ROLLBACK") {
    console.log("def_memos_and_dreamline_issuer: DRY RUN (thrown, rolled back)");
    console.log(JSON.stringify(report, null, 1));
  } else {
    console.error("def_memos_and_dreamline_issuer: FAILED —", (e as Error).message);
    process.exitCode = 1;
  }
} finally {
  const { pool, luciaPool } = (await import("../../apps/backend/src/auth/db.js")) as any;
  await luciaPool?.end?.().catch(() => {});
  await pool?.end?.().catch(() => {});
}
