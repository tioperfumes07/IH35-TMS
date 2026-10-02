#!/usr/bin/env node
// ROUND 326 (CC-1) — no cross-entity loads, no cancelled load carrying revenue.
// static: every cancel writer settles revrec in its transaction (settleRevrecOnCancel — cancellation.service.ts canonical
//         cancel + approval, mdata/loads.routes.ts board PATCH); book-load resolves an imported load's entity
//         (resolveInboundLoadEntity: unresolved / mismatched -> rejected, never a default).
// live (read-only, FAIL-CLOSED without DATABASE_URL), shrink-only against verify-no-cross-entity-loads.baseline.json:
//   1. no load under USMCA whose source names IH 35 TRANSPORTATION (the 21 measured 2026-10-02 are baselined until the
//      owner-ordered complete delete runs; source_entity_code <> the load's company fails once migration 202615210200 is in);
//   2. no cancelled load anywhere with a live posted revenue-recognition JE (11 measured 2026-10-02, baselined).
import { readFileSync } from "node:fs";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const LABEL = "verify-no-cross-entity-loads";
const ROOT = new URL("../", import.meta.url);
const read = (p) => readFileSync(new URL(p, ROOT), "utf8");
const base = JSON.parse(read("scripts/verify-no-cross-entity-loads.baseline.json"));

export function staticProblems(s) {
  const p = [];
  if ((s.cancel.match(/await settleRevrecOnCancel\(/g) ?? []).length < 2) p.push("cancellation.service.ts: the canonical cancel AND the approval must settle revrec (settleRevrecOnCancel)");
  if (!/await settleRevrecOnCancel\(client as never, current\.operating_company_id, row\.id/.test(s.board)) p.push("mdata/loads.routes.ts: the board PATCH cancel must settle revrec");
  if (!/export async function settleRevrecOnCancel/.test(s.poster) || !/accounting\.delete_cancelled_load_revrec\(/.test(s.poster)) p.push("poster.service.ts: settleRevrecOnCancel must delete through accounting.delete_cancelled_load_revrec");
  if (!/resolveInboundLoadEntity\(\{ targetCompanyCode: code, isImport: true/.test(s.book)) p.push("book-load.service.ts: an imported load must pass resolveInboundLoadEntity");
  if (!/inbound_load_entity_unresolved/.test(s.resolver) || !/inbound_load_entity_mismatch/.test(s.resolver)) p.push("inbound-load-entity.ts: unresolved / mismatched entity must be rejected by name");
  return p;
}

const src = {
  cancel: read("apps/backend/src/dispatch/cancellation.service.ts"),
  board: read("apps/backend/src/mdata/loads.routes.ts"),
  poster: read("apps/backend/src/accounting/revrec-delivery-posting/poster.service.ts"),
  book: read("apps/backend/src/dispatch/book-load.service.ts"),
  resolver: read("apps/backend/src/dispatch/inbound-load-entity.ts"),
};
const own = staticProblems(src);
if (own.length) { console.error(`${LABEL}: STATIC FAIL — ${own.join("; ")}`); process.exit(1); }
for (const [name, planted] of [
  ["approval does not settle", { ...src, cancel: src.cancel.replace(/await settleRevrecOnCancel\(/, "void (") }],
  ["board does not settle", { ...src, board: src.board.replace("await settleRevrecOnCancel(client as never, current.operating_company_id, row.id", "void (0") }],
  ["no entity resolution", { ...src, book: src.book.replace("resolveInboundLoadEntity({ targetCompanyCode: code, isImport: true", "({ x: 1") }],
]) {
  if (!staticProblems(planted).length) { console.error(`${LABEL} --selftest FAIL — plant "${name}" not caught`); process.exit(1); }
}
console.log(`${LABEL} --selftest PASS (static clean; 3/3 plants caught)`);
if (process.argv.includes("--selftest")) process.exit(0);

const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
try {
  await client.query("BEGIN READ ONLY");
  await client.query("SET LOCAL app.bypass_rls = 'lucia'");
  const hasCol = (await client.query(`SELECT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_schema = 'mdata' AND table_name = 'loads' AND column_name = 'source_entity_code') AS ok`)).rows[0].ok;
  const cross = (await client.query(
    `SELECT l.load_number FROM mdata.loads l JOIN org.companies c ON c.id = l.operating_company_id
      WHERE (c.code = 'USMCA' AND l.load_number = ANY($1::text[]))
         ${hasCol ? "OR (l.source_entity_code IS NOT NULL AND l.source_entity_code <> c.code)" : ""}`,
    [base.transportation_loads_under_usmca.load_numbers]
  )).rows.map((r) => r.load_number);
  const cancelled = (await client.query(
    `SELECT DISTINCT l.load_number FROM mdata.loads l
       JOIN accounting.load_revenue_recognition_postings r ON r.load_id = l.id AND r.is_active
       JOIN accounting.journal_entries j ON j.id = r.journal_entry_id AND j.voided_at IS NULL AND j.reversed_by_je_id IS NULL
      WHERE l.status::text = 'cancelled'`
  )).rows.map((r) => r.load_number);
  await client.query("ROLLBACK");
  const knownCross = new Set(base.transportation_loads_under_usmca.load_numbers);
  const knownCancelled = new Set(base.cancelled_with_live_revrec.load_numbers);
  const newCross = cross.filter((n) => !knownCross.has(n));
  const newCancelled = cancelled.filter((n) => !knownCancelled.has(n));
  const problems = [];
  if (newCross.length) problems.push(`${newCross.length} NEW cross-entity load(s): ${newCross.join(", ")}`);
  if (newCancelled.length) problems.push(`${newCancelled.length} NEW cancelled load(s) still carrying live revenue: ${newCancelled.join(", ")}`);
  if (problems.length) { console.error(`${LABEL}: LIVE FAIL — ${problems.join("; ")}`); process.exit(1); }
  const shrunkCross = [...knownCross].filter((n) => !cross.includes(n));
  const shrunkCancelled = [...knownCancelled].filter((n) => !cancelled.includes(n));
  console.log(`${LABEL}: LIVE PASS — cross-entity ${cross.length} (baseline ${knownCross.size}, measured_at ${base.transportation_loads_under_usmca.measured_at}); cancelled-with-revenue ${cancelled.length} (baseline ${knownCancelled.size}, measured_at ${base.cancelled_with_live_revrec.measured_at}), 0 new.${shrunkCross.length || shrunkCancelled.length ? ` SHRINK the baseline: ${[...shrunkCross, ...shrunkCancelled].join(", ")}` : ""}`);
} finally {
  client.release();
  await pool.end();
}
