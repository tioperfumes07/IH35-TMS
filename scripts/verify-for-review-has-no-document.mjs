#!/usr/bin/env node
// ROUND 360 (CC-2) — a For review (or Excluded) bank line carries NO document and NO kind.
//   for_review => resolution_kind NULL AND every link column NULL.
// Every Undo / Unmatch lands here; a For-review line still pointing at a document is a line the books count twice
// (once as resolved, once as waiting). Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
// Static: the state machine re-reads the line and throws unless it is in For review with no kind. Live, UNSCOPED,
// ceiling 0. Before 202615350600 is applied, review_state = 'for_review' lines with a link are reported (the migration
// moves them to Categorized) and do not fail.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { LINKED_SQL, NOT_FROZEN_SQL, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "every For-review bank line, unscoped, carries no document";

const LABEL = "verify-for-review-has-no-document";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ENGINE = "apps/backend/src/banking/bank-line-state-machine.service.ts";

export function check(engine) {
  const f = [];
  if (!/after\.rows\[0\]\?\.review_bucket !== "for_review" \|\| after\.rows\[0\]\?\.resolution_kind !== null/.test(engine)) {
    f.push(`${ENGINE}: undo no longer re-reads the line and refuses to commit unless it is in For review with no kind`);
  }
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, ENGINE), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const planted = real.replace('after.rows[0]?.review_bucket !== "for_review" || after.rows[0]?.resolution_kind !== null', "false");
  if (planted === real) fails.push("plant did not change the source"); else if (!check(planted).length) fails.push("plant escaped: re-read removed");
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS 2/2`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, ENGINE), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c, { hasBucket }) => {
  if (!hasBucket) {
    const pre = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions bt WHERE bt.review_state = 'for_review' AND bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()} AND ${LINKED_SQL()}`)).rows[0].n;
    const reviewed = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions bt WHERE bt.review_state = 'for_review' AND bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()}`)).rows[0].n;
    return { bad: [], pre, reviewed };
  }
  const bad = (await c.query(`
    SELECT (SELECT code FROM org.companies WHERE id = bt.operating_company_id) AS co, bt.review_bucket, count(*)::int AS n,
           (array_agg(bt.id::text))[1:3] AS ids
      FROM banking.bank_transactions bt
     WHERE ${NOT_FROZEN_SQL()} AND bt.review_bucket IN ('for_review', 'excluded') AND (bt.resolution_kind IS NOT NULL OR ${LINKED_SQL()})
     GROUP BY 1, 2`)).rows;
  const reviewed = (await c.query(`SELECT count(*)::int AS n FROM banking.bank_transactions bt WHERE bt.review_bucket = 'for_review' AND bt.voided_at IS NULL AND ${NOT_FROZEN_SQL()}`)).rows[0].n;
  return { bad, reviewed };
});
const fails = r.bad.map((x) => `${x.n} ${x.co} ${x.review_bucket} line(s) still carry a kind or a document (e.g. ${x.ids.join(", ")})`);
if (r.reviewed === 0) fails.push("positive control: 0 For-review lines read — the instrument saw nothing");
report(LABEL, fails, r.hasBucket
  ? `${r.reviewed} For-review lines (every non-frozen company, bypass=${r.bypass}); 0 For-review / Excluded lines with a kind or a document`
  : `202615350600 not yet applied — ${r.reviewed} review_state for_review lines; ${r.pre} carry a link and move to Categorized when it applies`);
