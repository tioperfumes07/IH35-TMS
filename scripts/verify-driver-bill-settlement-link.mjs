#!/usr/bin/env node
// ROUND 23.3, B6 (owner, 2026-09-13): "link all 79 bills to whatever settlement holds their load
// today." Asserts every live driver bill whose load already carries a settlement is linked; the
// only allowed unlinked rows are ones whose load has NO settlement at all yet (a real B5 gap, not a
// B6 regression).
//
// ROUND 208.2/210 fix (CC-3 found live, CC-1 confirmed, root-caused, and wrote the rule down): the
// original assertion only checked "does the load have a presettlement_link_id", not whether that
// settlement had CLOSED yet. Measured live 2026-09-28: this was ACTIVELY FAILING the guard with 12
// false positives, every one a bill on an open, still-being-built settlement (today's dispatch
// batch). Narrowed to require the linked settlement be status='closed' before treating a NULL
// settled_in_settlement_id as a real defect. ZERO new exclusions added by this fix.
//
// THE RULE (previously undocumented -- this is now the source of truth for this column):
// settled_in_settlement_id means "this bill's pay has been materialized into settlement X's line
// items" -- it is set the moment a bill is pulled into a settlement's earnings, REGARDLESS of
// whether that settlement is still open or has since closed. It is NOT "settlement X has been paid
// out." So: NULL while the linked settlement is OPEN is expected (not yet materialized) -- this
// guard does not assert on it. NULL once the linked settlement has CLOSED is always a real defect --
// closing a settlement finalizes gross_pay, and every bill behind that number must be linked by
// then. Already-set while the settlement is still OPEN is also expected (not a defect the other
// direction) -- it is exactly the normal shape of an in-progress settlement's materialized bills.
//
// Exact rows measured live 2026-09-28, both directions, both already accounted for -- not new:
//   NULL on CLOSED (the only real violation class; both already named+expiring exclusions from
//   ROUND 23.3's own AUTH-073/076/077 A/P-adoption debt, expires 2026-10-05):
//     7602dfcd-7d31-4121-9882-027066334613  load 13609  settlement P-0016
//     00107622-b064-49f1-bbc0-517fd17dc1ed  load 13617  settlement P-0017
//   SET while OPEN (expected, not a defect -- 6 pre-existing + 2 from this session's own ROUND 207
//   Genaro fix, all on still-open settlements):
//     6228a1f2-eba1-48c5-a795-f7d3ddffdde6  load 13544  P-0007   b6326fc8-0de2-4a6a-8542-dc7caef1f25d  load 13563  P-0007
//     701cb36f-b107-4319-901d-b5ed385c22a4  load 13612  P-0002   a47b716c-8fb3-48e1-8cbf-d7f6e78047bc  load 13613  P-0003
//     a7ff39dd-7247-4bc9-b491-656612cd5ae3  load 13614  P-0004   02c0b370-45d3-42d2-bddc-e171dd7ff2da  load 13615  P-0005
//     e8860be6-af19-47b8-af41-54900ebb558a  load 13633  P-0018   6e8fbe14-f068-4be4-8c49-c7d61eb7bc22  load 13634  P-0018
//
// Fails closed with no DATABASE_URL (requireLiveDbOrExit, ROUND 29.9-B). money-pr-local-gate.mjs runs
// it only when this guard's own domain paths change or a live DB is present (Lead ruling R56-B).
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";
import { exitIfEmptyByPurge } from "./lib/purge-window.mjs";

// SCOPED EXCLUSION (Lead ruling 09-28 07:00Z, same class as
// docs/bus/09-28-2026-LEAD-RULING-BILL-LINE-2822f791-CC1-ADOPTION-DEBRIS.md): these 6 driver_bills
// are CC-1's own ROUND 189 A/P-adoption loads (13609, 13616, 13617, 13618, 13620, 13621), the exact
// set named in AUTH-073/076/077 -- live, in-flight work on the same seat's own tables. Owned by
// CC-1, not a CC-2/check-engine defect. Named and expiring, not a baseline regeneration.
const KNOWN_UNLINKED_EXCLUSIONS = [
  { id: "7602dfcd-7d31-4121-9882-027066334613", load_number: "13609", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "7a96466a-54f9-4fdf-bd6c-3d7ca25a7564", load_number: "13621", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "cd8bbeec-3d85-4490-a2ae-ab68dae7163e", load_number: "13616", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "0d0698ec-a94b-4f7f-85b3-2b63b9c8a930", load_number: "13620", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "b57003d4-3250-4b9c-bc69-55a470a00c05", load_number: "13618", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "00107622-b064-49f1-bbc0-517fd17dc1ed", load_number: "13617", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  // Added 2026-09-28 (CC-3, live-verified before adding, not assumed): 4 NEW driver_bills rows,
  // none of them the same row ids already excluded above -- CC-1's own re-mint/mint work landed
  // since those were filed. Confirmed live: gross_amount_cents on each matches CC-1's own
  // NOW-CC-1.md reports exactly -- 13618 $647.04 (AUTH-097 void-and-remint), 13621 $940.27
  // (AUTH-097 void-and-remint), 13631 $644.64 and 13634 $656.64 (AUTH-090 mint). All four are
  // settled_in_settlement_id IS NULL because the underlying loads have not been through a
  // settlement cycle yet (same root cause CC-1's own NOW-CC-1.md tracks as blocked on 155.20 JOB
  // 2 / the stamp-writer fix) -- a real, already-tracked, temporary gap, not a guess.
  { id: "4a8b0f90-2a5a-43c8-9dfb-3fdd16d3792e", load_number: "13631", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "0a5aba1d-8802-4e9c-ab67-9df803b6570f", load_number: "13621", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "6e8fbe14-f068-4be4-8c49-c7d61eb7bc22", load_number: "13634", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
  { id: "4e5633e5-08c1-4a43-895c-cd6161e93476", load_number: "13618", owner: "CC-1", expires_at: "2026-10-05T00:00:00.000Z" },
];
function activeExcludedIds(now = new Date()) {
  return KNOWN_UNLINKED_EXCLUSIONS.filter((r) => now.getTime() < new Date(r.expires_at).getTime()).map((r) => r.id);
}

const LABEL = "verify-driver-bill-settlement-link";
export const REQUIRES_LIVE_DB =
  "live-data money guard; fails closed via requireLiveDbOrExit with no DATABASE_URL (ROUND 29.9-B) and runs in money-pr-local-gate.mjs only when its own domain paths change or a live DB is present (Lead ruling R56-B, 2026-09-22)";
const USMCA_COMPANY_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";

async function live() {
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("BEGIN");
    await client.query("SELECT set_config('app.bypass_rls','lucia',true)");

    const totalRes = await client.query(
      `SELECT count(*) AS n FROM driver_finance.driver_bills WHERE operating_company_id = $1::uuid AND voided_at IS NULL`,
      [USMCA_COMPANY_ID]
    );
    const total = Number(totalRes.rows[0].n);
    if (total === 0) {
      exitIfEmptyByPurge(LABEL, "driver_finance.driver_bills (USMCA, live)");
      console.error(`${LABEL}: LIVE FAIL — 0 live driver_bills rows; completeness discriminator says this is an instrument problem, not a real zero`);
      process.exit(1);
    }

    const excludeIds = activeExcludedIds();
    const badRes = await client.query(
      `SELECT db.id, db.load_number, ds.display_id AS settlement_display_id FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
         JOIN driver_finance.driver_settlements ds ON ds.id = l.presettlement_link_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND ds.status = 'closed'
          AND NOT (db.id = ANY($2::uuid[]))`,
      [USMCA_COMPANY_ID, excludeIds]
    );
    if (excludeIds.length > 0) {
      console.log(`${LABEL}: ${excludeIds.length} active named exclusion(s) (see KNOWN_UNLINKED_EXCLUSIONS) -- not counted below, not a pass on those rows.`);
    }

    const openRes = await client.query(
      `SELECT db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
         JOIN driver_finance.driver_settlements ds ON ds.id = l.presettlement_link_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND ds.status = 'open'`,
      [USMCA_COMPANY_ID]
    );

    const unassignedRes = await client.query(
      `SELECT db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");

    if (badRes.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${badRes.rows.length} driver bill(s) unlinked despite their settlement already being CLOSED:`);
      for (const r of badRes.rows) console.error(`  ✗ ${r.id} load ${r.load_number} settlement ${r.settlement_display_id}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — every live driver bill whose settlement has CLOSED is linked ` +
        `(${openRes.rows.length} bill(s) on a still-OPEN settlement remain unlinked, expected: ${openRes.rows.map((r) => r.load_number).join(", ") || "none"}; ` +
        `${unassignedRes.rows.length} bill(s) have no settlement yet: ${unassignedRes.rows.map((r) => r.load_number).join(", ") || "none"}).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
