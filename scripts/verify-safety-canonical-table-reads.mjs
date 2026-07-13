#!/usr/bin/env node
/**
 * SAFETY canonical-table-reads guard.
 *
 * Two confirmed phantom-table reads regressed silently (both wrapped in .catch/to_regclass so they
 * degraded to empty/0 instead of 500 — invisible until someone noticed the KPI/list was always blank):
 *
 *   (1) Home "Open Damage" KPI — apps/backend/src/reports/library.routes.ts read `safety.accidents`,
 *       a table that never existed in db/migrations/. Canonical is `safety.accident_reports`
 *       (migration 0049). The to_regclass guard literal masked it, so the KPI read 0 forever.
 *   (2) Safety training completions — apps/backend/src/safety/safety.routes.ts read
 *       `safety.training_completions`, phantom. The create endpoint writes the real table
 *       `safety.training_records` (migration 0250), so created records vanished from the list.
 *
 * Lock: neither route file may reference the phantom names again, and each must keep its canonical
 * name. Comments are stripped before matching so this file's own explanatory text (which names the
 * phantom tokens) never trips the grep.
 *
 * --selftest exercises assertGuard() against inline good/bad fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-safety-canonical-table-reads";

// Phantom table names that must NEVER reappear (escaped dots — `safety\.accidents` will NOT match
// `safety.accident_reports` since 'accidents' requires a trailing 's', nor the URL '/safety/accidents').
const PHANTOM = ["safety\\.accidents", "safety\\.training_completions"];

const TARGETS = [
  { file: "apps/backend/src/reports/library.routes.ts", canonical: "safety.accident_reports" },
  { file: "apps/backend/src/safety/safety.routes.ts", canonical: "safety.training_records" },
];

/** Strip block + line comments so explanatory prose naming the phantom tokens is never matched. */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
}

export function assertGuard({ file, source, canonical }) {
  const errors = [];
  const code = stripComments(source);
  for (const p of PHANTOM) {
    if (new RegExp(p).test(code)) {
      errors.push(`${file}: references phantom table '${p.replace(/\\/g, "")}' — use the canonical safety.* table`);
    }
  }
  if (canonical && !code.includes(canonical)) {
    errors.push(`${file}: expected canonical table '${canonical}' not found (read may have been repointed away)`);
  }
  return errors;
}

function selftest() {
  const goodKpi = `FROM safety.accident_reports a WHERE a.operating_company_id = $1`;
  const goodSafety = `FROM safety.training_records WHERE operating_company_id = $1 ORDER BY completed_at DESC`;
  const cases = [
    { n: "kpi canonical → 0", args: { file: "kpi", source: goodKpi, canonical: "safety.accident_reports" }, want: 0 },
    { n: "safety canonical → 0", args: { file: "safety", source: goodSafety, canonical: "safety.training_records" }, want: 0 },
    {
      n: "phantom safety.accidents reappears",
      args: { file: "kpi", source: `FROM safety.accidents a WHERE a.operating_company_id = $1`, canonical: "safety.accident_reports" },
      min: 1,
    },
    {
      n: "phantom training_completions reappears",
      args: { file: "safety", source: `FROM safety.training_completions WHERE operating_company_id = $1`, canonical: "safety.training_records" },
      min: 1,
    },
    {
      n: "canonical repointed away",
      args: { file: "kpi", source: `FROM safety.something_else a`, canonical: "safety.accident_reports" },
      min: 1,
    },
    {
      n: "phantom only inside a comment → ignored",
      args: { file: "kpi", source: `// do NOT reintroduce safety.accidents\nFROM safety.accident_reports a`, canonical: "safety.accident_reports" },
      want: 0,
    },
  ];
  let failed = 0;
  for (const c of cases) {
    const n = assertGuard(c.args).length;
    const ok = c.want !== undefined ? n === c.want : n >= c.min;
    if (!ok) failed++;
    console.log(`${ok ? "ok  " : "FAIL"}  ${c.n}  (errors=${n})`);
  }
  if (failed) { console.error(`\n${LABEL} SELFTEST FAILED: ${failed}`); process.exit(1); }
  console.log(`\n${LABEL} SELFTEST PASS`);
}

if (process.argv.includes("--selftest")) { selftest(); process.exit(0); }

let total = 0;
for (const t of TARGETS) {
  const p = path.join(ROOT, t.file);
  if (!fs.existsSync(p)) { console.error(`[${LABEL}] FAILED — missing ${t.file}`); process.exit(1); }
  const errors = assertGuard({ file: t.file, source: fs.readFileSync(p, "utf8"), canonical: t.canonical });
  for (const e of errors) console.error(`  ✗ ${e}`);
  total += errors.length;
}
if (total) { console.error(`[${LABEL}] FAILED — ${total} issue(s).`); process.exit(1); }
console.log(`[${LABEL}] OK — safety reads use canonical tables (safety.accident_reports + safety.training_records); no phantom safety.accidents / safety.training_completions.`);
