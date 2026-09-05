#!/usr/bin/env node
/**
 * verify-box1-tax-year-uses-issued-date — SETL-TAX-YEAR-USES-CLEARED-DATE.
 *
 * IRS Box-1 (1099-NEC nonemployee comp) is cash-basis: reportable in the year the payment was
 * ISSUED, not the year the work was performed and not the year a bank happened to confirm the
 * payment cleared. `driver_finance.driver_settlements` carries two mutually-exclusive "issued"
 * timestamps (`payment_sent_at` for the electronic sent_to_bank branch, `paid_at` for the manual
 * branch) and a THIRD, later, reconciliation-only timestamp (`payment_cleared_at`) that can fall
 * in the NEXT calendar year for a payment issued in the prior one (Dec 31 sent, Jan 2 cleared).
 *
 * FOUND LIVE 2026-09-01 (CODEX parity audit), FIXED 2026-09-05 (CC-1): the tax-year filter in
 * box1-aggregation.service.ts used `COALESCE(s.payment_cleared_at, s.paid_at)` — preferring the
 * reconciliation date over the issue date, and never even considering `payment_sent_at` — so a
 * payment issued Dec 31 and cleared Jan 2 would silently move real driver income onto the WRONG
 * YEAR'S 1099.
 *
 * WHAT IT ASSERTS: box1-aggregation.service.ts's tax-year predicate keys on
 * `payment_sent_at`/`paid_at` and never on `payment_cleared_at` anywhere in the same statement.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-box1-tax-year-uses-issued-date";
const TARGET = path.join(ROOT, "apps", "backend", "src", "tax-documents", "box1-aggregation.service.ts");

/** Strip // and /* *\/ comments so a markdown-style `inline code span` in a doc comment is never
 *  mistaken for a template literal (comments here deliberately name the wrong column in prose). */
function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
            .replace(/\/\/[^\n]*/g, (m) => m.replace(/[^\n]/g, " "));
}

/** Every backtick-delimited SQL template literal in the file, comments stripped first. */
function sqlStatements(src) {
  const out = [];
  const re = /`([^`]*)`/g;
  let m;
  while ((m = re.exec(stripComments(src)))) out.push(m[1]);
  return out;
}

export function check(targetPath = TARGET) {
  if (!fs.existsSync(targetPath)) return { ok: false, reason: `missing: ${path.relative(ROOT, targetPath)}` };
  const src = fs.readFileSync(targetPath, "utf8");
  const statements = sqlStatements(src);
  if (!statements.length) return { ok: false, reason: "no SQL template literal found to check" };
  if (statements.some((sql) => /payment_cleared_at/.test(sql))) {
    return { ok: false, reason: "payment_cleared_at referenced in a SQL statement — Box-1 tax-year selection must never use the bank-reconciliation date" };
  }
  if (!statements.some((sql) => /COALESCE\(\s*s\.payment_sent_at\s*,\s*s\.paid_at\s*\)/.test(sql))) {
    return { ok: false, reason: "expected COALESCE(s.payment_sent_at, s.paid_at) as the tax-year predicate — not found" };
  }
  return { ok: true };
}

function report(result) {
  if (result.ok) {
    console.log(`${LABEL} OK — Box-1 tax-year selection keys on payment_sent_at/paid_at (issued), never payment_cleared_at (reconciliation)`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${result.reason}`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "box1-year-"));
  const f = path.join(tmp, "box1-aggregation.service.ts");
  const failures = [];

  fs.writeFileSync(f, "const q = `WHERE date_part('year', COALESCE(s.payment_sent_at, s.paid_at))::int = $3::int`;");
  if (!check(f).ok) failures.push("case1 FAIL — correct predicate must be GREEN.");

  fs.writeFileSync(f, "const q = `WHERE date_part('year', COALESCE(s.payment_cleared_at, s.paid_at))::int = $3::int`;");
  if (check(f).ok) failures.push("case2 FAIL — payment_cleared_at must go RED.");

  fs.writeFileSync(f, "const q = `WHERE date_part('year', s.paid_at)::int = $3::int`;");
  if (check(f).ok) failures.push("case3 FAIL — missing payment_sent_at COALESCE must go RED.");

  fs.writeFileSync(f, "// prose mentioning payment_cleared_at is fine, only real SQL is checked\nconst q = `WHERE date_part('year', COALESCE(s.payment_sent_at, s.paid_at))::int = $3::int`;");
  if (!check(f).ok) failures.push("case4 FAIL — a prose comment mentioning payment_cleared_at must not fail the check.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — correct predicate GREEN, cleared_at RED, missing-sent_at RED`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(check()));
}
