#!/usr/bin/env node
/**
 * verify-factoring-statements-summary-detail-toggle.mjs
 *
 * NEW-25 (owner 2026-09-07 raw findings): "Statements/Settings need a summary-totals vs.
 * detailed-view toggle." Live-verified on /factoring/statements-settings (Chrome, this session):
 * the "Statement history" panel only ever rendered one-row-per-month totals
 * (STATEMENT_HISTORY_COLUMNS / settingsQuery.data.statements) with no way to see the individual
 * transactions behind a given month.
 *
 * FIX: FactoringHome.tsx's statements_settings tab gained a Summary/Detail toggle
 * (statementsView state). Summary is the existing monthly-totals table (unchanged, still the
 * default). Detail reuses the SAME already-fetched line-item chargeback/fee history
 * (feesQuery.data.history) the Chargebacks & Fees tab already renders via ChargebacksTable — no
 * new backend query, no new data source.
 *
 * WHAT IS ASSERTED: the statements_settings tab block declares a statementsView state, renders
 * both a "Summary" and "Detail" toggle button wired to it, and conditionally renders
 * STATEMENT_HISTORY_COLUMNS for summary vs <ChargebacksTable> (fed by feesQuery.data.history)
 * for detail.
 *
 * Usage:
 *   node scripts/verify-factoring-statements-summary-detail-toggle.mjs            # scan
 *   node scripts/verify-factoring-statements-summary-detail-toggle.mjs --selftest # planted-failure harness
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-factoring-statements-summary-detail-toggle";
const HOME = "apps/frontend/src/pages/factoring/FactoringHome.tsx";

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) return { ok: false, src: "", err: `MISSING ${rel}` };
  return { ok: true, src: fs.readFileSync(p, "utf8"), err: null };
}

/** Exported for --selftest. */
export function checkToggle(src) {
  const failures = [];
  if (!/const \[statementsView, setStatementsView\] = useState<"summary" \| "detail">\("summary"\)/.test(src)) {
    failures.push(`${HOME}: missing statementsView state (default "summary").`);
  }
  const tabSection = src.split('tab === "statements_settings"')[1]?.slice(0, 4000) ?? "";
  if (!tabSection) {
    failures.push(`${HOME}: could not find the statements_settings tab block.`);
    return failures;
  }
  if (!/onClick=\{\(\) => setStatementsView\("summary"\)\}/.test(tabSection)) {
    failures.push(`${HOME}: missing a "Summary" toggle button wired to setStatementsView("summary").`);
  }
  if (!/onClick=\{\(\) => setStatementsView\("detail"\)\}/.test(tabSection)) {
    failures.push(`${HOME}: missing a "Detail" toggle button wired to setStatementsView("detail").`);
  }
  if (!/statementsView === "summary"[\s\S]{0,400}STATEMENT_HISTORY_COLUMNS/.test(tabSection)) {
    failures.push(`${HOME}: summary view must still render STATEMENT_HISTORY_COLUMNS.`);
  }
  if (!/<ChargebacksTable[\s\S]{0,200}feesQuery\.data\?\.history/.test(tabSection)) {
    failures.push(`${HOME}: detail view must render <ChargebacksTable> fed by feesQuery.data.history.`);
  }
  return failures;
}

export function run() {
  const failures = [];
  const { ok, src, err } = read(HOME);
  if (!ok) {
    failures.push(err);
    return { ok: false, failures };
  }
  failures.push(...checkToggle(src));
  return { ok: failures.length === 0, failures };
}

if (process.argv.includes("--selftest")) {
  const goodSrc = `
    const [statementsView, setStatementsView] = useState<"summary" | "detail">("summary");
    tab === "statements_settings" ? (
      <div>
        <button onClick={() => setStatementsView("summary")}>Summary</button>
        <button aria-pressed={statementsView === "detail"} onClick={() => setStatementsView("detail")}>Detail</button>
        {statementsView === "summary" ? (
          <ParityTable columns={STATEMENT_HISTORY_COLUMNS} rows={[]} />
        ) : (
          <ChargebacksTable rows={feesQuery.data?.history ?? []} />
        )}
      </div>
    ) : null
  `;
  const badMissingState = goodSrc.replace(
    'const [statementsView, setStatementsView] = useState<"summary" | "detail">("summary");\n    ',
    "",
  );
  const badMissingSummaryButton = goodSrc.replace(
    '<button onClick={() => setStatementsView("summary")}>Summary</button>\n        ',
    "",
  );
  const badMissingDetailTable = goodSrc.replace(
    "<ChargebacksTable rows={feesQuery.data?.history ?? []} />",
    "<div>no detail</div>",
  );

  const checks = [
    ["clean toggle passes", checkToggle(goodSrc).length === 0],
    ["missing state fails", checkToggle(badMissingState).length > 0],
    ["missing summary button fails", checkToggle(badMissingSummaryButton).length > 0],
    ["missing detail table fails", checkToggle(badMissingDetailTable).length > 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [name] of failed) console.error(`  ✗ ${name}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const { ok, failures } = run();
if (!ok) {
  console.error(`${LABEL}: FAIL`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — Statements & Settings has a working Summary/Detail toggle (NEW-25)`);
process.exit(0);
