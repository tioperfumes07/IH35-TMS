#!/usr/bin/env node
// verify-only-the-posting-engine-writes-postings.mjs — ROUND 377.3 (Lead, 2026-10-03).
//
// TEN DOORS INTO ONE LEDGER. Measured on 2026-10-03: ten backend services contain a real
// `INSERT INTO accounting.journal_entry_postings`, while 87 files call the posting engine properly.
//
// That is the single root cause behind most of what this session found:
//   * 3,908 of 7,909 postings with no spine link — ten places to forget writeTransactionSourceLink
//   * 1090 at -151,736.34 and 1295 at -33,839.80 — ten places to resolve the wrong role
//   * 0 postings carrying load_id — ten places to miss the stamp
//   * postings written after their document's transaction committed — ten places to get it wrong
//
// Fixing writers one at a time is the patch pattern the owner has forbidden. Collapsing the doors is
// the permanent fix, and it is how QuickBooks and NetSuite are both built: ONE posting engine; every
// document type hands it balanced legs and its source document; nothing else touches the table.
//
// This guard does not do the collapse. It FREEZES THE LIST so door eleven cannot open while the
// collapse happens one PR at a time. The allowlist is SHRINK-ONLY: removing a file is a merge,
// adding one needs a Lead ruling — same rule as docs/audit/VERIFY-STATIC-BASELINE.json.
//
// Static. No database. Runs anywhere, costs nothing, and it is the cheapest thing in this repo.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

// --selftest (Devin build order 2026-10-05): one case that MUST pass (the real tree) and one that
// MUST fail (a bare fixture cwd — a guard that reports green with none of its inputs present is a
// vacuous proof). Never writes to tracked source.
if (process.argv.includes("--selftest")) { await selftest_verify_only_the_posting_engine_writes_postings(); }
async function selftest_verify_only_the_posting_engine_writes_postings() {
  const { runGuard, withTmpFixture, reportSelftest, statusOf, outputOf } = await import("./lib/guard-selftest.mjs");
  const { fileURLToPath } = await import("node:url");
  const me = fileURLToPath(import.meta.url);
  const live = runGuard(me);
  const planted = withTmpFixture(
    {
      "apps/backend/src/accounting/posting-engine.service.ts": "// the engine\nawait client.query(`INSERT INTO accounting.journal_entry_postings (id) VALUES ($1)`, [id]);",
      "apps/backend/src/evil/backdoor.ts": "await client.query(`INSERT INTO accounting.journal_entry_postings (id) VALUES ($1)`, [id]);",
    },
    ["apps/backend/src/evil"],
    (tmp) => runGuard(me, { env: { VERIFY_ROOT: tmp } }),
  );
  reportSelftest("verify_only_the_posting_engine_writes_postings", [
    { name: "real tree green", pass: statusOf(live) === 0, detail: statusOf(live) === 0 ? undefined : outputOf(live).slice(-300) },
    { name: "planted unallowlisted writer fails", pass: statusOf(planted) !== 0 && /backdoor\.ts/.test(outputOf(planted)), detail: outputOf(planted).slice(-200) },
  ]);
}

const LABEL = "verify-only-the-posting-engine-writes-postings";
const ROOT = process.env.VERIFY_ROOT
  ? path.resolve(process.env.VERIFY_ROOT)
  : path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");

// The ten doors as they stood on 2026-10-03, each with the reason it is still open and who closes it.
// NOTHING IS ADDED HERE WITHOUT A LEAD RULING FILENAME. Entries leave as the collapse lands.
const ALLOWED = new Map([
  ["accounting/posting-engine.service.ts", "THE ENGINE. The one sanctioned writer. This entry never leaves."],
  ["accounting/posting-line-writer.ts", "THE ONE POSTING-LINE WRITER (Lead ruling docs/bus/10-04-2026-LEAD-RULING-ONE-POSTING-LINE-WRITER.md): inserts the line AND its transaction_source_links row together. Every door below collapses into it; this entry never leaves."],
]);

const INSERT_RE = /insert\s+into\s+accounting\.journal_entry_postings/i;

const walk = (dir, out = []) => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== "dist") walk(p, out); continue; }
    if (!e.name.endsWith(".ts")) continue;
    if (e.name.endsWith(".test.ts") || p.includes("/__tests__/")) continue;  // tests may plant anything
    out.push(p);
  }
  return out;
};

const found = [];
for (const file of walk(SRC)) {
  const text = fs.readFileSync(file, "utf8");
  if (INSERT_RE.test(text)) found.push(path.relative(SRC, file));
}
found.sort();

const unexpected = found.filter((f) => !ALLOWED.has(f));
const closed = [...ALLOWED.keys()].filter((f) => !found.includes(f)).sort();

console.log(`${LABEL} — ${found.length} file(s) insert into accounting.journal_entry_postings (allowlist holds ${ALLOWED.size})\n`);
for (const f of found) console.log(`  ${ALLOWED.has(f) ? "allowed" : "NEW    "}  ${f}`);

if (closed.length) {
  console.log(`\n  ${closed.length} door(s) CLOSED since the list was frozen — remove them from ALLOWED in this same PR:`);
  for (const f of closed) console.log(`    ${f}`);
}

if (unexpected.length) {
  console.error(
    `\n${LABEL}: FAIL — ${unexpected.length} file(s) write to accounting.journal_entry_postings and are not on the allowlist:\n` +
      unexpected.map((f) => `  ${f}`).join("\n") +
      `\n\nDoor eleven does not open. Route the posting through accounting/posting-engine.service.ts, which resolves the\n` +
      `role, writes the posting, writes the spine link, stamps load_id and commits in the caller's transaction.\n` +
      `If this file genuinely must insert directly, it needs a Lead ruling filename and an entry here stating who\n` +
      `closes it and when. The allowlist is SHRINK-ONLY (ROUND 377.3).\n`
  );
  process.exit(1);
}

console.log(`\n${LABEL}: PASS — no new direct writer. ${ALLOWED.size - closed.length} door(s) still to collapse into the engine.`);
process.exit(0);
