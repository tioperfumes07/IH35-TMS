#!/usr/bin/env node
/**
 * GUARD: every UPDATE that voids an invoice must stamp `voided_at` in the SAME statement.
 *
 * FAIL-V1 (CC-1, 2026-08-08) — a dispatched load could not be cancelled at all. The cancel cascade
 * wrote `accounting.invoices.status = 'void'` without `voided_at`, which violates the prod CHECK
 *
 *     invoices_void_state_authoritative  CHECK ((status = 'void') = (voided_at IS NOT NULL))
 *
 * Because that constraint is a BICONDITIONAL, the failing UPDATE aborted the whole transaction and
 * took the entire cancel down with it. Measured live on prod 2026-08-08: L-20260808-0093 stayed
 * `dispatched` and INV-2026-00024 stayed `proforma` / `voided_at NULL`, while the control
 * INV-2026-00020 was correctly `void` WITH `voided_at 19:33:05.257322+00`. After the fix, the cancel
 * committed atomically — load `dispatched -> cancelled` and INV-2026-00024 `void` + `voided_at`, both
 * stamped 20:01:59.406752+00 (same instant, one transaction).
 *
 * WHY THE GUARD IS ON THE WRITE AND NOT ON PROD ROWS: prod currently reports ZERO rows with
 * `status='void' AND voided_at IS NULL` — precisely because the CHECK rejects them. A live query can
 * therefore never go red, no matter how broken the code is; the damage shows up as a rolled-back
 * cancel, not as a bad row. The only place this is detectable ahead of time is the SQL text.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *  - It does not touch the CHECK constraint. That constraint is the thing CATCHING the bug and is the
 *    only guarantee of void-not-delete integrity on invoices — never weaken it to make a cancel pass.
 *  - It does not police `accounting.bills`. Bills carry a second, older vocabulary (`revoked_at`) and
 *    conflating the two is how this was mis-filed before; bills need their own guard, not this one.
 *
 * Run:  node scripts/verify-invoice-void-stamps-voided-at.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-invoice-void-stamps-voided-at";

/** Strip comments so a rationale note mentioning voided_at cannot satisfy the check. */
const strip = (s) => s.replace(/\/\/[^\n]*/g, "").replace(/\/\*[\s\S]*?\*\//g, "");

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "__tests__" || e.name === "node_modules") continue;
      walk(p, out);
    } else if (e.name.endsWith(".ts")) {
      out.push(p);
    }
  }
  return out;
}

/**
 * Find `UPDATE accounting.invoices ... SET ... status = 'void'` statements and require that the same
 * statement also assigns voided_at. The statement window ends at the closing backtick of the SQL
 * template literal, so a voided_at belonging to a LATER query cannot satisfy an earlier one.
 */
export function collectProblems(src, label = "<src>") {
  const problems = [];
  if (!src) return [`${label} not readable`];
  const code = strip(src);

  const re = /UPDATE\s+accounting\.invoices\b/gi;
  let m;
  while ((m = re.exec(code)) !== null) {
    const end = code.indexOf("`", m.index);
    const stmt = code.slice(m.index, end === -1 ? m.index + 900 : end);
    // Only statements that actually set status to 'void' are in scope.
    if (!/status\s*=\s*'void'/i.test(stmt)) continue;
    // CASE expressions that merely preserve an existing void are not void-writes.
    if (/WHEN\s+status\s*=\s*'void'\s+THEN\s+'void'/i.test(stmt)) continue;
    if (!/voided_at\s*=/i.test(stmt)) {
      problems.push(
        `${label}: an UPDATE sets accounting.invoices.status='void' without stamping voided_at in the same statement — ` +
          `CHECK invoices_void_state_authoritative is a biconditional, so this aborts the whole transaction (FAIL-V1)`
      );
    }
  }
  return problems;
}

function selftest() {
  const cases = [
    {
      name: "real cancel cascade passes",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'void', voided_at = now(), updated_at = now() WHERE source_load_id = $1\`);`,
      expect: 0,
    },
    {
      name: "FAIL-V1 shape is caught",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'void', updated_at = now() WHERE source_load_id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "voided_at from a LATER query does not rescue an earlier one",
      src:
        "await client.query(`UPDATE accounting.invoices SET status = 'void', updated_at = now() WHERE id = $1`);\n" +
        "await client.query(`UPDATE accounting.invoices SET voided_at = now() WHERE id = $1`);",
      expectAtLeast: 1,
    },
    {
      name: "comment mentioning voided_at does not satisfy the guard",
      src: `// voided_at = now()\nawait client.query(\`UPDATE accounting.invoices SET status = 'void' WHERE id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "CASE that preserves an existing void is not a void-write",
      src: `await client.query(\`UPDATE accounting.invoices SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'factored' END WHERE id = $1\`);`,
      expect: 0,
    },
    {
      name: "non-void update is ignored",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'sent' WHERE id = $1\`);`,
      expect: 0,
    },
  ];

  let pass = 0;
  for (const c of cases) {
    const problems = collectProblems(c.src, c.name);
    const ok = c.expect === 0 ? problems.length === 0 : problems.length >= (c.expectAtLeast ?? 1);
    if (ok) pass += 1;
    else console.error(`  selftest FAIL: ${c.name} -> ${JSON.stringify(problems)}`);
  }
  console.log(`${LABEL} selftest ${pass}/${cases.length}`);
  return pass === cases.length ? 0 : 1;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  if (!fs.existsSync(SRC_DIR)) {
    console.error(`${LABEL}: FAIL — ${SRC_DIR} not found`);
    return 1;
  }
  const problems = [];
  for (const file of walk(SRC_DIR)) {
    const rel = path.relative(root, file);
    problems.push(...collectProblems(fs.readFileSync(file, "utf8"), rel));
  }
  if (problems.length) {
    console.error(`${LABEL}: FAIL`);
    for (const p of problems) console.error(`  - ${p}`);
    return 1;
  }
  console.log(`${LABEL}: ok`);
  return 0;
}

process.exit(main());
