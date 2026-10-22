#!/usr/bin/env node
/**
 * LEAD 443.240 (owner 10-22: "read the company and driver settlements. you did not seed correctly.") — LOAD MILES COME FROM
 * THE SIGNED SETTLEMENT. 20 USMCA loads carried Google / lane-history / 443.86-estimate miles that disagreed with the driver
 * side LOADED / EMPTY MILES lines of their signed settlement (13684: 1,817.3 deadhead invented; the document says 466.7).
 *
 * PRECEDENCE (permanent): (1) signed settlement document → (2) AlwaysTrack → (3) lane history → (4) Google shortest.
 * STATIC: RULE 1 setMilesChoice locks a document value (only another document value replaces it) and takes the document's
 *   value; RULE 2 the 443.86 deadhead fill never overwrites an empty-miles document value; RULE 3 the short-miles fallback
 *   never overwrites a loaded-miles document value.
 * LIVE (USMCA, read-only): RULE 4 every load on a live settlement with a driver-side "Loaded Miles" line has loaded miles =
 *   the document's, and empty miles = the document's "Empty Miles" line (0 when the document has none).
 * Lines are matched by category AND description — a layover / other line miscategorized as loaded_miles is not a miles line.
 * --selftest plants each regression.
 */
import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { requireLiveDbOrExit } from "./lib/require-live-db.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-miles-match-settlement-document";
const USMCA = "5c854333-6ea5-4faa-af31-67cb272fef80";
const F = {
  miles: "apps/backend/src/dispatch/mileage/miles-recommendations.service.ts",
  short: "apps/backend/src/dispatch/short-miles-fallback.ts",
};
const read = (rel) => readFileSync(resolve(ROOT, rel), "utf8");
const DOC_GUARD = /AND NOT \(COALESCE\(miles_choice->'FIELD'->>'source', ''\) = 'document' AND miles_choice->'FIELD'->>'document_value' IS NOT NULL\)/;
const docGuard = (field) => new RegExp(DOC_GUARD.source.replaceAll("FIELD", field));

export function staticFailures(miles, short) {
  const out = [];
  const set = miles.slice(miles.indexOf("export async function setMilesChoice("), miles.indexOf("export async function setMilesChoice(") + 6000);
  if (!/const documentLocked = prior\?\.source === "document" && num\(prior\?\.document_value\) != null;/.test(set) ||
      !/if \(documentLocked && args\.source !== "document"\)\s*throw new MilesChoiceError\(`document_miles_locked_\$\{args\.field\}`\);/.test(set))
    out.push(`RULE 1 ${F.miles}: setMilesChoice must refuse any non-document source over a document value`);
  if (!/else if \(args\.source === "document"\) value = args\.documentValue != null \? round1\(Number\(args\.documentValue\)\) : documentValue;/.test(set))
    out.push(`RULE 1 ${F.miles}: setMilesChoice source 'document' must take the signed settlement's value`);
  const fill = miles.slice(miles.indexOf("export async function fillLoadDeadhead("));
  const upd = fill.slice(fill.indexOf("UPDATE mdata.loads"), fill.indexOf("UPDATE mdata.loads") + 900);
  if (!docGuard("empty").test(upd)) out.push(`RULE 2 ${F.miles}: the 443.86 deadhead fill overwrites an empty-miles document value`);
  const supd = short.slice(short.indexOf("UPDATE mdata.loads"), short.indexOf("UPDATE mdata.loads") + 1200);
  if (!docGuard("short").test(supd)) out.push(`RULE 3 ${F.short}: the short-miles fallback overwrites a loaded-miles document value`);
  return out;
}

export function liveFailures(rows) {
  return rows.map((r) =>
    `RULE 4 load ${r.load_number} (settlement ${r.doc_ref ?? "?"}): document ${r.doc_loaded} loaded / ${r.doc_empty} empty — app ${r.app_loaded ?? "null"} / ${r.app_empty}`);
}

export const LIVE_SQL = `
WITH doc AS (
  SELECT sl.load_id,
         round(sum(sl.quantity) FILTER (WHERE sl.category = 'loaded_miles' AND sl.description ~* 'loaded miles'), 1) AS doc_loaded,
         round(COALESCE(sum(sl.quantity) FILTER (WHERE sl.category = 'empty_miles' AND sl.description ~* 'empty miles'), 0), 1) AS doc_empty,
         max(s.source_document_ref) AS doc_ref
    FROM driver_finance.settlement_lines sl
    JOIN driver_finance.driver_settlements s ON s.id = sl.settlement_id
   WHERE s.operating_company_id = $1::uuid AND s.voided_at IS NULL AND s.status <> 'cancelled'
     AND sl.voided_at IS NULL AND sl.load_id IS NOT NULL AND sl.category IN ('loaded_miles', 'empty_miles')
   GROUP BY sl.load_id
)
SELECT l.load_number, doc.doc_ref, doc.doc_loaded::text, doc.doc_empty::text,
       COALESCE(l.loaded_miles, l.miles_shortest)::numeric(10,1)::text AS app_loaded, COALESCE(l.miles_deadhead, 0)::numeric(10,1)::text AS app_empty
  FROM doc JOIN mdata.loads l ON l.id = doc.load_id AND l.voided_at IS NULL AND l.operating_company_id = $1::uuid
 WHERE doc.doc_loaded IS NOT NULL
   AND (COALESCE(l.loaded_miles, l.miles_shortest, -1) <> doc.doc_loaded OR COALESCE(l.miles_deadhead, 0) <> doc.doc_empty)
 ORDER BY l.load_number`;

const isMain = process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) {
    const miles = read(F.miles), short = read(F.short);
    const cases = [
      ["main source is clean", staticFailures(miles, short).length === 0],
      ["RULE 1 lock removed", staticFailures(miles.replace("if (documentLocked && args.source !== \"document\")", "if (false)"), short).some((x) => x.startsWith("RULE 1"))],
      ["RULE 1 document value ignored", staticFailures(miles.replace("value = args.documentValue != null ? round1(Number(args.documentValue)) : documentValue;", "value = documentValue;"), short).some((x) => x.startsWith("RULE 1"))],
      ["RULE 2 deadhead fill over a document", staticFailures(miles.replace(/\n\s*AND NOT \(COALESCE\(miles_choice->'empty'[^\n]*/, ""), short).some((x) => x.startsWith("RULE 2"))],
      ["RULE 3 fallback over a document", staticFailures(miles, short.replace(/\n\s*AND NOT \(COALESCE\(miles_choice->'short'[^\n]*/, "")).some((x) => x.startsWith("RULE 3"))],
      ["RULE 4 agreeing load passes", liveFailures([]).length === 0],
      ["RULE 4 13684-style invented deadhead fails", liveFailures([{ load_number: "13684", doc_ref: "5849", doc_loaded: "1510.4", doc_empty: "466.7", app_loaded: "1510.4", app_empty: "1817.3" }]).length === 1],
    ];
    for (const [n, pass] of cases) console.log(`  ${pass ? "✓" : "✗"} ${n}`);
    const bad = cases.filter(([, pass]) => !pass).length;
    console.log(bad ? `${LABEL} --selftest FAIL` : `${LABEL} --selftest PASS (${cases.length}/${cases.length})`);
    process.exit(bad ? 1 : 0);
  }
  const failures = staticFailures(read(F.miles), read(F.short));
  const { client, pool } = await requireLiveDbOrExit({ label: LABEL });
  try {
    await client.query("SET TRANSACTION READ ONLY").catch(() => {});
    const rows = (await client.query(LIVE_SQL, [USMCA])).rows;
    failures.push(...liveFailures(rows));
  } finally {
    client.release();
    await pool.end();
  }
  if (failures.length) {
    console.error(`${LABEL}: FAIL (${failures.length})\n  ${failures.join("\n  ")}`);
    process.exit(1);
  }
  console.log(`${LABEL}: OK — every USMCA load on a signed settlement carries the document's loaded / empty miles; the engine locks them.`);
}
