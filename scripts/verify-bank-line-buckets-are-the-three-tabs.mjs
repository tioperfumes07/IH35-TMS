#!/usr/bin/env node
// ROUND 360 (CC-2) — no bank line sits anywhere a tab cannot show. Three buckets only: for_review | categorized | excluded
// (QuickBooks' three tabs). matched / transfer are KINDS (the Action column), never buckets — 29 USMCA lines once sat in
// 'matched' with no document and no tab. Spec: docs/bus/00-CONTRACT-BANK-FEED-STATE-MACHINE-MATCH-UNMATCH-CATEGORIZE-UNDO.md
// Static: the migration's bucket CHECK holds exactly the three values; the classifier trigger exists.
// Live, UNSCOPED: rows outside the three — ceiling 0 (before 202615350600 is applied: what the classifier will assign).
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { BUCKET_SQL, NOT_FROZEN_SQL, THE_THREE_TABS, report, withUnscopedReadOnly } from "./lib/bank-feed-state-machine.mjs";
export const REQUIRES_LIVE_DB = "every bank line, unscoped, sits in one of the three tabs";

const LABEL = "verify-bank-line-buckets-are-the-three-tabs";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MIG = "db/migrations/202615350600_bank_feed_bucket_and_kind.sql";

export function check(mig) {
  const f = [];
  const m = /CHECK \(review_bucket IN \(([^)]*)\)\)/.exec(mig);
  const vals = m ? [...m[1].matchAll(/'([^']+)'/g)].map((x) => x[1]).sort() : [];
  if (JSON.stringify(vals) !== JSON.stringify([...THE_THREE_TABS].sort())) f.push(`${MIG}: the bucket CHECK must be exactly ${THE_THREE_TABS.join(" | ")} (found ${vals.join(" | ") || "none"})`);
  if (!/CREATE TRIGGER trg_bank_line_classify BEFORE INSERT OR UPDATE ON banking\.bank_transactions/.test(mig)) f.push(`${MIG}: the classifier trigger (BEFORE INSERT OR UPDATE) is gone — the bucket would be typed by hand again`);
  if (!/chk_bank_line_review_bucket_present\s+CHECK \(review_bucket IS NOT NULL\)/.test(mig)) f.push(`${MIG}: every written line must carry a bucket (chk_bank_line_review_bucket_present)`);
  return f;
}

if (process.argv.includes("--selftest")) {
  const real = fs.readFileSync(path.join(ROOT, MIG), "utf8");
  const fails = [];
  if (check(real).length) fails.push(`tree not clean: ${check(real).join("; ")}`);
  const plants = [
    ["a fourth bucket", real.replace("CHECK (review_bucket IN ('for_review', 'categorized', 'excluded'))", "CHECK (review_bucket IN ('for_review', 'categorized', 'excluded', 'matched'))")],
    ["trigger dropped", real.replace("CREATE TRIGGER trg_bank_line_classify BEFORE INSERT OR UPDATE ON", "CREATE TRIGGER trg_bank_line_classify BEFORE INSERT ON")],
    ["bucket may be NULL", real.replace("CHECK (review_bucket IS NOT NULL)", "CHECK (true)")],
  ];
  for (const [n, s] of plants) if (s === real) fails.push(`plant did not change the source: ${n}`); else if (!check(s).length) fails.push(`plant escaped: ${n}`);
  if (fails.length) { console.error(`${LABEL} --selftest FAIL: ${fails.join("; ")}`); process.exit(1); }
  console.log(`${LABEL} --selftest PASS ${plants.length + 1}/${plants.length + 1}`);
  process.exit(0);
}

const statik = check(fs.readFileSync(path.join(ROOT, MIG), "utf8"));
if (statik.length) report(LABEL, statik, "");
const r = await withUnscopedReadOnly(LABEL, async (c, { hasBucket }) => {
  const rows = (await c.query(`
    SELECT (SELECT code FROM org.companies WHERE id = bt.operating_company_id) AS co, b AS bucket, count(*)::int AS n
      FROM banking.bank_transactions bt, LATERAL (SELECT ${BUCKET_SQL(hasBucket)} AS b) x
     WHERE ${NOT_FROZEN_SQL()}
     GROUP BY 1, 2 ORDER BY 1, 2`)).rows;
  return { rows };
});
const off = r.rows.filter((x) => !THE_THREE_TABS.includes(x.bucket));
report(
  LABEL,
  off.map((x) => `${x.n} ${x.co} line(s) in bucket ${JSON.stringify(x.bucket)} — no tab shows it`),
  `${r.total} bank lines (every non-frozen company, bypass=${r.bypass}, ${r.hasBucket ? "review_bucket" : "classifier preview — 202615350600 not yet applied"}): ` +
    r.rows.map((x) => `${x.co} ${x.bucket} ${x.n}`).join(" · ") + " — 0 outside the three tabs"
);
