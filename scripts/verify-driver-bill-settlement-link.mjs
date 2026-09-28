#!/usr/bin/env node
// ROUND 23.3, B6 (owner, 2026-09-13): "link all 79 bills to whatever settlement holds their load
// today." Asserts every live driver bill whose load already carries a settlement is linked; the
// only allowed unlinked rows are ones whose load has NO settlement at all yet (a real B5 gap, not a
// B6 regression).
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
      `SELECT db.id, db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NOT NULL
          AND NOT (db.id = ANY($2::uuid[]))`,
      [USMCA_COMPANY_ID, excludeIds]
    );
    if (excludeIds.length > 0) {
      console.log(`${LABEL}: ${excludeIds.length} active named exclusion(s) (see KNOWN_UNLINKED_EXCLUSIONS) -- not counted below, not a pass on those rows.`);
    }

    const unassignedRes = await client.query(
      `SELECT db.load_number FROM driver_finance.driver_bills db
         JOIN mdata.loads l ON l.id = db.load_id AND l.operating_company_id = db.operating_company_id
        WHERE db.operating_company_id = $1::uuid AND db.voided_at IS NULL
          AND db.settled_in_settlement_id IS NULL AND l.presettlement_link_id IS NULL`,
      [USMCA_COMPANY_ID]
    );

    await client.query("COMMIT");

    if (badRes.rows.length > 0) {
      console.error(`${LABEL}: LIVE FAIL — ${badRes.rows.length} driver bill(s) unlinked despite their load already carrying a settlement:`);
      for (const r of badRes.rows) console.error(`  ✗ ${r.id} load ${r.load_number}`);
      process.exit(1);
    }
    console.log(
      `${LABEL}: LIVE PASS — every live driver bill whose load carries a settlement is linked ` +
        `(${unassignedRes.rows.length} bill(s) remain unlinked, all blocked on their load having no settlement yet: ${unassignedRes.rows.map((r) => r.load_number).join(", ") || "none"}).`
    );
  } finally {
    client.release();
    await pool.end();
  }
}

await live();
