#!/usr/bin/env node
/**
 * GUARD: a void-write must satisfy ITS OWN table's void-state biconditional, in the same statement.
 *
 * Two tables, two DIFFERENT contracts — verified on prod `br-fancy-credit-akjnd07a` 2026-08-08 via
 * pg_get_constraintdef, not from memory:
 *
 *   accounting.invoices  invoices_void_state_authoritative
 *     CHECK ((status = 'void') = (voided_at IS NOT NULL))
 *
 *   accounting.bills     bills_void_state_authoritative
 *     CHECK ((status = 'void') = ((voided_at IS NOT NULL) OR (revoked_at IS NOT NULL)))
 *
 * FAIL-V1 (CC-1, 2026-08-08): the dispatch cancel cascade set `accounting.invoices.status = 'void'`
 * without `voided_at`. Because the constraint is a BICONDITIONAL, the UPDATE did not merely skip a
 * column — it aborted the whole transaction, so a dispatched load could not be cancelled at all.
 * Measured live: L-20260808-0093 stuck `dispatched`, INV-2026-00024 `proforma`/`voided_at NULL`,
 * while control INV-2026-00020 was `void` WITH `voided_at 19:33:05.257322+00`. After #4952
 * (`49c201c`) the cancel committed atomically — load `dispatched -> cancelled` and INV-2026-00024
 * `void` + `voided_at`, both stamped 20:01:59.406752+00.
 *
 * ★ WHY BILLS ARE CHECKED DIFFERENTLY — this is the trap this guard exists to avoid.
 * A naive "voided_at is required" rule applied to bills FALSE-POSITIVES on correct code. Live counts
 * on USMCA: of 6 void bills, 4 satisfy the constraint via `voided_at` and **2 via `revoked_at` ONLY**.
 * Every bill void site on main — bills.service.ts and governance/void-cancel-executors.ts — writes
 * `revoked_at`, and that is CORRECT under the bills contract. Demanding `voided_at` there would redden
 * working code, which is the `expected-state-recorded-as-failure` anti-pattern. So: invoices require
 * `voided_at`; bills accept EITHER stamp.
 *
 * WHY A STATIC GUARD AND NOT A LIVE QUERY: prod reports ZERO rows violating either biconditional —
 * precisely because the CHECKs reject them. A live assertion is therefore permanently green no matter
 * how broken the code is; the damage shows up as a rolled-back transaction, never as a bad row. The
 * only place this is detectable in advance is the SQL text.
 *
 * NEVER weaken either CHECK to make a write pass. They are the only guarantee of void-not-delete
 * integrity on these tables — they are catching the bug, not causing it.
 *
 * Run:  node scripts/verify-void-state-biconditional-stamps.mjs [--selftest]
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC_DIR = path.join(root, "apps/backend/src");
const LABEL = "verify-void-state-biconditional-stamps";

/** Each table's own contract. `accepts` = the stamps that satisfy its biconditional. */
const CONTRACTS = [
  {
    table: "accounting.invoices",
    constraint: "invoices_void_state_authoritative",
    accepts: ["voided_at"],
  },
  {
    table: "accounting.bills",
    constraint: "bills_void_state_authoritative",
    accepts: ["voided_at", "revoked_at"],
  },
];

/** Strip comments so a rationale note mentioning a stamp cannot satisfy the check. */
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

export function collectProblems(src, label = "<src>") {
  const problems = [];
  if (!src) return [`${label} not readable`];
  const code = strip(src);

  for (const { table, constraint, accepts } of CONTRACTS) {
    // Word-boundary the table so `accounting.bill_payments` is not matched by `accounting.bills`.
    const re = new RegExp(`UPDATE\\s+${table.replace(".", "\\.")}\\b`, "gi");
    let m;
    while ((m = re.exec(code)) !== null) {
      // The statement ends at the SQL template literal's closing backtick, so a stamp belonging to a
      // LATER query cannot satisfy an earlier one.
      const end = code.indexOf("`", m.index);
      const stmt = code.slice(m.index, end === -1 ? m.index + 900 : end);
      if (!/status\s*=\s*'void'/i.test(stmt)) continue;
      // A CASE that merely preserves an existing void is not a void-write.
      if (/WHEN\s+status\s*=\s*'void'\s+THEN\s+'void'/i.test(stmt)) continue;
      const satisfied = accepts.some((col) => new RegExp(`${col}\\s*=`, "i").test(stmt));
      if (!satisfied) {
        problems.push(
          `${label}: an UPDATE sets ${table}.status='void' without stamping ${accepts.join(" or ")} in the same ` +
            `statement — CHECK ${constraint} is a biconditional, so this aborts the whole transaction (FAIL-V1)`
        );
      }
    }
  }
  return problems;
}

function selftest() {
  const cases = [
    {
      name: "invoices: cancel cascade with voided_at passes",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'void', voided_at = now(), updated_at = now() WHERE source_load_id = $1\`);`,
      expect: 0,
    },
    {
      name: "invoices: FAIL-V1 shape is caught",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'void', updated_at = now() WHERE source_load_id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "invoices: revoked_at does NOT satisfy the invoice contract",
      src: `await client.query(\`UPDATE accounting.invoices SET status = 'void', revoked_at = now() WHERE id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "bills: revoked_at ALONE passes (real bills.service.ts / void-cancel-executors.ts shape)",
      src: `await client.query(\`UPDATE accounting.bills SET status = 'void', revoked_at = now(), revoked_by_user_id = $3 WHERE id = $1\`);`,
      expect: 0,
    },
    {
      name: "bills: voided_at alone also passes",
      src: `await client.query(\`UPDATE accounting.bills SET status = 'void', voided_at = now() WHERE id = $1\`);`,
      expect: 0,
    },
    {
      name: "bills: neither stamp is caught",
      src: `await client.query(\`UPDATE accounting.bills SET status = 'void', updated_at = now() WHERE id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "accounting.bill_payments is not matched by the bills rule",
      src: `await client.query(\`UPDATE accounting.bill_payments SET status = 'void', updated_at = now() WHERE id = $1\`);`,
      expect: 0,
    },
    {
      name: "a stamp from a LATER query does not rescue an earlier statement",
      src:
        "await client.query(`UPDATE accounting.invoices SET status = 'void', updated_at = now() WHERE id = $1`);\n" +
        "await client.query(`UPDATE accounting.invoices SET voided_at = now() WHERE id = $1`);",
      expectAtLeast: 1,
    },
    {
      name: "comment mentioning the stamp does not satisfy the guard",
      src: `// voided_at = now()\nawait client.query(\`UPDATE accounting.invoices SET status = 'void' WHERE id = $1\`);`,
      expectAtLeast: 1,
    },
    {
      name: "CASE preserving an existing void is not a void-write",
      src: `await client.query(\`UPDATE accounting.invoices SET status = CASE WHEN status = 'void' THEN 'void' ELSE 'factored' END WHERE id = $1\`);`,
      expect: 0,
    },
    {
      name: "non-void update is ignored",
      src: `await client.query(\`UPDATE accounting.bills SET status = 'open' WHERE id = $1\`);`,
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
    problems.push(...collectProblems(fs.readFileSync(file, "utf8"), path.relative(root, file)));
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
