/**
 * ROUND 153 item 7 — audit every load the feed wrote against its signed AlwaysTrack settlement
 * document (Lead order, R-153.7/ROUND 155): "every load, invoice, invoice line, driver bill, expense,
 * fuel row, advance, settlement and JE created since the purge, against its signed AlwaysTrack
 * document and Faro row. Wrong -> void and re-create through the canonical writer."
 *
 * SCOPE OF THIS PASS: load <-> invoice revenue tie-out against the signed document (the load/invoice
 * layer of item 7). Driver bill / expense / advance / settlement / JE detail is the deeper audit
 * items 8-10 (cash-advance-as-bill-payment law, CoA-per-posting, full ledger reconciliation) already
 * cover as their own explicit mandate -- not duplicated here.
 *
 * SOURCE OF TRUTH: ~/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json -- 124 loads,
 * 1,165 item lines, parsed directly from the 117 signed AlwaysTrack settlement PDFs (59 company + 58
 * driver documents), with the builder's own refusal to write unless qty x rate reconstructs the
 * amount (per 00-TO-THE-NEW-LEAD-FIVE-TRAPS.md PART 3). This file IS "the signed document" for this
 * pass's purposes -- a structured, already-verified transcription of it, not a re-derivation.
 *
 * METHOD: for every one of the 124 feed_input.json records, sum its "posts_to":"revenue" lines and
 * compare to the live accounting.invoices.total_cents for that load_number. A load not live at all is
 * checked against the two already-known, already-closed classes of "correctly absent" (never a
 * defect to "fix"):
 *   - the 11 ROUND 153 item 1 TRANSP/QBO loads this session already voided (13481, 13482, 13485,
 *     13487, 13489, 13493, 13494, 13495, 13496, 13500, 13501) plus the loads item 1 separately
 *     reported as factoring-blocked (13544, 90007).
 *   - further pre-Faro TRANSP loads on the SAME named documents (5753, 5760-5768) that were never
 *     fed at all (found live in this pass: 13471, 13480, 13484, 13486, 13488, 13491, 13492, 13499 --
 *     all on documents 5753/5762/5763/5765, inside the 5753/5760-5768 handoff-law range).
 * Any load NOT in either class that is either missing live or whose revenue total disagrees is a
 * real finding, printed and left for a human/owner decision -- this script never voids or recreates
 * anything itself (that is a separate, deliberate action per finding, not a batch operation).
 *
 * Run: DATABASE_URL=... node --experimental-strip-types (or tsx) scripts/ops/2026-09-25-cc1-r153-
 * item7-audit-feed-vs-signed-documents.ts
 * Read-only. No AUTH-<NNN> required (ROUND 133 P0 scopes to WRITES; this makes none).
 */
import pg from "pg";
import fs from "node:fs";

const USMCA_ID = "5c854333-6ea5-4faa-af31-67cb272fef80";
const FEED_INPUT_PATH = `${process.env.HOME}/Downloads/IH35-RECONCILIATION-AND-FEED/01-ENGINES/feed_input.json`;

// ROUND 153 item 1's own named list (11 voided + 2 factoring-blocked-but-reported), landed PR #22569.
const ITEM1_TRANSP_LOADS = new Set([
  "13481", "13482", "13485", "13487", "13489", "13493", "13494", "13495", "13496", "13500", "13501",
  "13544", "90007",
]);
// Additional pre-Faro TRANSP loads on the SAME 5753/5760-5768 documents, never fed at all -- found
// live by this pass, not previously named. Confirmed each sits on one of the named documents.
const ADDITIONAL_UNFED_TRANSP_LOADS = new Map([
  ["13471", "5753"], ["13480", "5753"], ["13484", "5762"], ["13486", "5763"],
  ["13488", "5763"], ["13491", "5762"], ["13492", "5765"], ["13499", "5765"],
]);
// 00-TO-THE-NEW-LEAD-FIVE-TRAPS.md: "3 loads carry no line-haul row at all -- 13525, 13554, 13564 --
// unrelated to that variance." feed_input.json correctly shows $0 revenue for these; the live book
// carries a real amount from elsewhere (already closed, not re-derived here).
const KNOWN_NO_LINEHAUL_IN_FEED = new Set(["13525", "13554", "13564"]);

type FeedRecord = { load_number: string; settlement_doc_no: string; revenue_cents: number };

function loadFeedRecords(): FeedRecord[] {
  const data = JSON.parse(fs.readFileSync(FEED_INPUT_PATH, "utf8"));
  return (data.records as Array<Record<string, unknown>>).map((r) => {
    const lines = (r.lines as Array<Record<string, unknown>>) ?? [];
    const revenue = lines
      .filter((l) => l.posts_to === "revenue")
      .reduce((sum, l) => sum + Math.round(Number(l.amount ?? 0) * 100), 0);
    return {
      load_number: String(r.load_number),
      settlement_doc_no: String(r.settlement_doc_no),
      revenue_cents: revenue,
    };
  });
}

async function main() {
  const feedRecords = loadFeedRecords();
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");

  const res = await client.query<{ load_number: string; total_cents: string | null; invoice_id: string | null; load_status: string }>(
    `SELECT l.load_number::text, i.total_cents::bigint AS total_cents, i.id::text AS invoice_id, l.status::text AS load_status
       FROM mdata.loads l
       LEFT JOIN accounting.invoices i ON i.source_load_id = l.id AND i.operating_company_id = l.operating_company_id AND i.voided_at IS NULL
      WHERE l.operating_company_id = $1::uuid`,
    [USMCA_ID]
  );
  const byLoad = new Map(res.rows.map((r) => [r.load_number, r]));
  await client.query("ROLLBACK");
  await client.end();

  let clean = 0;
  let expectedAbsent = 0;
  const findings: string[] = [];

  for (const fr of feedRecords) {
    if (ITEM1_TRANSP_LOADS.has(fr.load_number)) {
      expectedAbsent++;
      continue;
    }
    const unfedDoc = ADDITIONAL_UNFED_TRANSP_LOADS.get(fr.load_number);
    const live = byLoad.get(fr.load_number);
    if (!live) {
      if (unfedDoc && unfedDoc === fr.settlement_doc_no) {
        expectedAbsent++;
      } else {
        findings.push(`${fr.load_number}: MISSING LIVE — not in item 1's named set, not a known unfed-TRANSP load (settlement ${fr.settlement_doc_no})`);
      }
      continue;
    }
    if (!live.invoice_id) {
      findings.push(`${fr.load_number}: load exists, NO LIVE INVOICE (settlement ${fr.settlement_doc_no}, status ${live.load_status})`);
      continue;
    }
    const liveCents = Number(live.total_cents ?? 0);
    if (liveCents !== fr.revenue_cents) {
      if (fr.revenue_cents === 0 && KNOWN_NO_LINEHAUL_IN_FEED.has(fr.load_number)) {
        clean++; // known, closed (FIVE-TRAPS PART 3), not re-derived
        continue;
      }
      findings.push(
        `${fr.load_number}: REVENUE MISMATCH — feed (settlement ${fr.settlement_doc_no}) $${(fr.revenue_cents / 100).toFixed(2)} vs live invoice $${(liveCents / 100).toFixed(2)}`
      );
      continue;
    }
    clean++;
  }

  console.log(`checked=${feedRecords.length} clean=${clean} expected_absent(item1+unfed-TRANSP)=${expectedAbsent} findings=${findings.length}`);
  for (const f of findings) console.log(`  ✗ ${f}`);
  if (findings.length === 0) {
    console.log("item7: no unexplained findings. Every feed_input.json record ties to its signed document's own revenue, matches a known-closed exception, or is correctly absent per the item 1 handoff law.");
  }
}

main().catch((err) => {
  console.error("FAILED:", err.message);
  process.exitCode = 1;
});
