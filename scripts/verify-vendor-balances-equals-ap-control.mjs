#!/usr/bin/env node
/**
 * KILL THE SECOND SYSTEM table 12 (CC-3) — FAILS IF accounting.vendor_balances and A/P control disagree.
 * vendor_balances is a VIEW over open bills (never a stored balance). The GL is A/P control: the account bound to role
 * ap_control. Two facts, both on USMCA (TRANSPORTATION / TRUCKING are frozen and never read):
 *   1. PER VENDOR — the view's balance equals the A/P GL attributed to that vendor (by the posting's vendor entity or its
 *      source bill's vendor), for every vendor on either side.
 *   2. NOTHING OWED TO NOBODY — A/P control net equals the sum of the view. A/P that no vendor owes is a defect.
 *      Named debt (shrink-only): the 60 AUTH-138 re-reversals measured 2026-10-03 (2,976.63) — awaiting the owner AUTH
 *      for scripts/ops/2026-10-03-cc3-table12-undo-auth138-double-reversal.mts. The allowance is computed from the
 *      listed entries that are STILL unreversed, so it shrinks to 0 by itself when the AUTH runs; once all are reversed
 *      the list must be deleted (an exemption with nothing left to exempt FAILS).
 * Run: node scripts/verify-vendor-balances-equals-ap-control.mjs [--selftest]
 */
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

export const REQUIRES_LIVE_DB = "the A/P GL and the vendor subledger are live facts";
const LABEL = "verify-vendor-balances-equals-ap-control";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";

/** The 60 AUTH-138 entries (Dr 9000 / Cr 2000, source journal_entry, no vendor). Shrink-only. */
export const KNOWN_VENDORLESS_JES = [
  "02135c5c-ad7d-4eb0-ac43-9059eb0d05be", "054b12e1-23b5-47ac-a613-8569760fdeab",
  "19656da7-cf96-4653-9981-82d5a23392d7", "1b7e045c-029f-4d75-a6c9-65dc3ee5d29a",
  "22bee89b-1334-460b-a4a2-08bca37c2231", "24d6bbd4-e070-4c81-9906-998395fb03c1",
  "26fb4fd7-d1f3-4482-9fd6-526bfb81511f", "2d4fd9ff-3a9a-4fe9-8cca-62cb256ed10d",
  "30aef690-9165-4a29-a4e8-ca745d7d9e28", "3d472835-cdc4-4685-9b1a-416b9db479ad",
  "3e65c048-8d74-47be-b5ae-114d31bc6c4c", "3fcbda90-9ce4-4c7c-a890-220abd8386af",
  "42503538-80eb-4d70-8ee8-8a6baff600ef", "444804e9-cf76-449d-a546-95a9be4cd82b",
  "4c0fcc5c-a3dd-49b1-bcd8-a9b80bc2513f", "4c5f848a-fc32-417f-88e3-2982d804edc6",
  "558d362d-9773-457e-bd6f-a2d06c2f808a", "69d45097-590c-4264-9324-51299b584261",
  "6b2ab61f-9281-4847-a6db-739da1d6a24b", "6c4fbd93-3189-4c3d-b8c5-da1ccdc3b0b1",
  "72ed1ddc-a34e-4d1b-b827-9ce5319461aa", "74b5d8ab-8feb-4d1e-b485-7c140c4f282d",
  "7d24158b-f29f-445c-89b9-8d0ef0547496", "800a55d0-bf7e-4174-968e-586fd1720cdc",
  "819c3769-a53e-4368-8683-d7831f410254", "8789b536-b6ee-460f-8d18-7258a7a820be",
  "9176e3c9-6961-4dd6-b81b-769304018727", "93541b96-9d73-4f30-81f1-66e5265e9266",
  "96606653-d17c-4008-a86d-ffef9199abed", "9882c496-afee-4fc8-8e24-cc69d73267e1",
  "99790c7f-2637-4302-86cf-a887e81e7754", "9b600460-acd1-40f0-b587-a1c50fc4ab9d",
  "9b72e2f1-6e87-4056-a76d-bedd44d4aedd", "a41183ce-b266-46a1-81d0-436358a16660",
  "a416a65f-ab7d-4f5f-982e-4a50cf8016f2", "a5b7188e-d776-4906-ae7c-7b8958ff69e4",
  "a91e82c6-e907-461e-8bcb-239c0606d8b2", "ad50832d-a837-4a37-99d0-c2bdd3c7c564",
  "ae4de3a1-faef-4743-aeff-f63f960ae84d", "b183729f-3d7d-4b7a-8657-fbbc9e144a3d",
  "b1a2b760-5f59-4c8e-88f0-04e039c31974", "c18f63d2-e5b2-4a95-a846-a8b4c1d263a5",
  "c2d918d6-b4b7-4c05-9f61-3baa68659fd3", "c3d561ba-8fa0-4dc6-92f5-6230b1ac104c",
  "c725b4c4-b2c5-45f6-b4dc-1319988fccab", "d0ef4066-653c-40cb-82e8-a3d62101ab65",
  "d8dfa4d1-af6c-415d-9299-d76801e376e1", "d90fa2ea-1e53-409f-a99e-71a0986c680d",
  "e44edd4f-8445-4679-9348-ecdd024bab60", "e6bca270-ed2e-4fd6-ad67-76d47079bb0b",
  "e8c92b4b-8fca-4edd-a680-7ef2f2534dec", "e8ec1a26-4f7a-427d-a6c5-65bd1ed0e5a6",
  "ed5040db-bc08-4d23-950d-5ceb2de3d69c", "f2f35978-2ff8-45cd-b3e1-9e59d0fa07ea",
  "f6225d55-d8c0-4dab-b4e7-38a4811cd31d", "f6c8efa8-1f20-49b3-b5a0-46666fc9572c",
  "fbf671e2-10b4-469b-998a-997a07c3ff15", "fd93fa5c-a5f9-482e-9edd-2b147d997659",
  "fec6c033-fa7b-41da-a697-327bbe46ae6d", "fedcf228-d977-43c0-8015-99d4171f3f20",
];

export function evaluate({ perVendor, apNet, viewTotal, debtListed, debtOpenCents }) {
  const problems = [];
  for (const v of perVendor) {
    if (Number(v.gl_cents) !== Number(v.view_cents)) problems.push(`vendor ${v.vendor_id} (${v.name ?? "?"}): view ${v.view_cents} ≠ A/P GL ${v.gl_cents}`);
  }
  const vendorless = Number(apNet) - Number(viewTotal);
  if (vendorless !== Number(debtOpenCents)) {
    problems.push(`A/P control nets ${apNet} but the vendor subledger totals ${viewTotal}: ${vendorless} owed to no vendor (named debt still open: ${debtOpenCents})`);
  }
  if (debtListed > 0 && Number(debtOpenCents) === 0) problems.push("every named AUTH-138 entry is reversed — delete KNOWN debt from this guard (shrink-only)");
  return problems;
}

if (process.argv.includes("--selftest")) {
  const ok = evaluate({ perVendor: [{ vendor_id: "a", gl_cents: 5, view_cents: 5 }], apNet: 105, viewTotal: 5, debtListed: 60, debtOpenCents: 100 });
  const drift = evaluate({ perVendor: [{ vendor_id: "a", gl_cents: 6, view_cents: 5 }], apNet: 6, viewTotal: 5, debtListed: 0, debtOpenCents: 0 });
  const nobody = evaluate({ perVendor: [], apNet: 50, viewTotal: 0, debtListed: 0, debtOpenCents: 0 });
  const stale = evaluate({ perVendor: [], apNet: 0, viewTotal: 0, debtListed: 60, debtOpenCents: 0 });
  const cases = [
    ["ties, with the named debt still open, passes", ok.length === 0],
    ["a per-vendor drift FAILS", drift.length === 2 || drift.some((p) => p.includes("view 5 ≠ A/P GL 6"))],
    ["A/P owed to no vendor FAILS", nobody.length === 1],
    ["a fully-reversed named debt FAILS until removed", stale.length === 1],
  ];
  const bad = cases.filter(([, v]) => !v);
  if (bad.length) { console.error(`${LABEL} selftest FAIL: ${bad.map(([n]) => n).join("; ")}`); process.exit(1); }
  console.log(`${LABEL} selftest ${cases.length}/${cases.length}`);
  process.exit(0);
}

const { client: c, pool } = await requireLiveDbOrExit({ label: LABEL });
let problems = [];
try {
  await c.query("BEGIN READ ONLY");
  await c.query("SET LOCAL app.bypass_rls = 'lucia'");
  const ap = (await c.query(
    `SELECT r.account_id::text id, a.account_number FROM accounting.chart_of_accounts_roles r JOIN catalogs.accounts a ON a.id = r.account_id
      WHERE r.operating_company_id = $1::uuid AND r.role = 'ap_control' AND r.is_active`, [USMCA])).rows;
  if (ap.length !== 1) throw new Error(`expected one active ap_control binding for USMCA, found ${ap.length}`);
  const AP = ap[0].id;
  const perVendor = (await c.query(
    `WITH gl AS (
       SELECT COALESCE(CASE WHEN p.entity_type ILIKE 'vendor%' THEN p.entity_uuid::text END,
                       (SELECT COALESCE(NULLIF(b.vendor_id, ''), NULLIF(b.vendor_uuid, '')) FROM accounting.bills b
                         WHERE p.source_transaction_type = 'bill' AND b.id::text = p.source_transaction_id::text)) vendor_id,
              sum(CASE WHEN p.debit_or_credit = 'credit' THEN p.amount_cents ELSE -p.amount_cents END)::bigint gl_cents
         FROM accounting.journal_entry_postings p
        WHERE p.account_id = $1::uuid AND p.operating_company_id = $2::uuid GROUP BY 1),
     vw AS (SELECT vendor_id, balance_cents FROM accounting.vendor_balances WHERE operating_company_id = $2::uuid)
     SELECT COALESCE(gl.vendor_id, vw.vendor_id) vendor_id,
            (SELECT vendor_name FROM mdata.vendors v WHERE v.id::text = COALESCE(gl.vendor_id, vw.vendor_id)) name,
            COALESCE(gl.gl_cents, 0) gl_cents, COALESCE(vw.balance_cents, 0) view_cents
       FROM gl FULL JOIN vw ON vw.vendor_id = gl.vendor_id
      WHERE COALESCE(gl.vendor_id, vw.vendor_id) IS NOT NULL
        AND (COALESCE(gl.gl_cents, 0) <> 0 OR COALESCE(vw.balance_cents, 0) <> 0)`, [AP, USMCA])).rows;
  const apNet = (await c.query(
    `SELECT COALESCE(sum(CASE WHEN debit_or_credit = 'credit' THEN amount_cents ELSE -amount_cents END), 0)::bigint n
       FROM accounting.journal_entry_postings WHERE account_id = $1::uuid AND operating_company_id = $2::uuid`, [AP, USMCA])).rows[0].n;
  const viewTotal = (await c.query(`SELECT COALESCE(sum(balance_cents), 0)::bigint s FROM accounting.vendor_balances WHERE operating_company_id = $1::uuid`, [USMCA])).rows[0].s;
  const debtOpenCents = (await c.query(
    `SELECT COALESCE(sum(p.amount_cents), 0)::bigint s
       FROM accounting.journal_entries j JOIN accounting.journal_entry_postings p ON p.journal_entry_uuid = j.id AND p.account_id = $1::uuid
      WHERE j.operating_company_id = $2::uuid AND j.reversed_by_je_id IS NULL AND j.id = ANY($3::uuid[])
        AND p.source_transaction_type = 'journal_entry' AND p.debit_or_credit = 'credit'`, [AP, USMCA, KNOWN_VENDORLESS_JES])).rows[0].s;
  await c.query("ROLLBACK");
  problems = evaluate({ perVendor, apNet, viewTotal, debtListed: KNOWN_VENDORLESS_JES.length, debtOpenCents });
  console.log(`${LABEL}: USMCA A/P ${ap[0].account_number} nets ${apNet}; vendor subledger ${viewTotal} across ${perVendor.length} vendor(s); named AUTH-138 debt still open ${debtOpenCents}`);
} finally {
  c.release();
  await pool.end();
}
if (problems.length) { for (const p of problems) console.error(`FAIL ${p}`); process.exit(1); }
console.log(`${LABEL}: PASS — the vendor subledger is the A/P GL, vendor by vendor`);
