#!/usr/bin/env node
// verify-accounting-line-scope-inheritance (0519-es1-58 — scope-inheritance CI guard, NON-FINANCIAL)
//
// THE GAP (0519 audit es1/58): the 0519 sweep flagged accounting child-LINE tables that carry NO
// scope column of their own (no operating_company_id / tenant_id) and therefore can only stay
// entity-isolated by INHERITING scope through an ENFORCED foreign key to their scoped parent. But
// NO CI guard verified that inheritance actually holds. accounting.invoice_lines does it correctly
// (own operating_company_id + enforced invoice FK) and accounting.expense_lines has an enforced
// expense_id FK (202606151300); accounting.bill_lines.bill_id still has NO FK to accounting.bills —
// so a stray/mismatched parent id on a bill line is unconstrained (a silent cross-entity leak surface).
//
// WHAT THIS GUARD DOES (a truth-based regression lock + ratchet — it does NOT itself change schema;
// adding the missing bill_lines FK is owner-gated financial-cluster migration work, db-integrity-hardening-0519):
//   • For every registered accounting scope-inheriting line table, it scans db/migrations/ for an
//     ENFORCED parent FK on the parent-id column, SCOPED TO THAT CHILD TABLE (inline REFERENCES inside
//     the child's CREATE body, or an ALTER TABLE <child> ... ADD ... FOREIGN KEY (<col>) statement) —
//     never a same-named column on some other table.
//   • status:"enforced"  → the FK MUST be present. FAILS if it is ever dropped/renamed away — so the
//     tables that already inherit scope correctly can never silently regress.
//   • status:"deferred"  → the FK must still be ABSENT (the known, owner-gated gap). If a migration
//     adds it, the guard FAILS asking the author to PROMOTE the entry to "enforced" — so the registry
//     can never drift out of sync with reality and the gap-closure is noticed the moment it lands.
//   • It also reports whether each deferred child still lacks its own scope column (the reason it must
//     inherit) so the deferred set stays honest.
//
// This is additive, static (reads only db/migrations/*.sql), and Rule-17 compliant: wired via
// scripts/verify-steps/1210-…; no package.json / ci.yml / locked-guards edits.
//
// Self-test: node scripts/verify-accounting-line-scope-inheritance.mjs --selftest
// LINKAGE: entity-scope integrity infra for accounting.* child-line tables. Additive-only.

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const MIGRATIONS = path.join(ROOT, "db/migrations");

/**
 * Registry of accounting child-LINE tables that must inherit operating-company scope via an enforced
 * FK to a scoped parent. Truth-verified against db/migrations/ on 2026-07-21:
 *   - invoice_lines: own operating_company_id + enforced invoice_id FK (0060)          → enforced
 *   - expense_lines: enforced expense_id FK (202606151300)                             → enforced
 *   - bill_lines:    bill_id NOT NULL, no FK, no own scope column                      → deferred
 * "deferredTo" names the owner-gated block that will add the FK (financial-cluster migration).
 */
const SCOPE_INHERITANCE = [
  {
    child: "accounting.invoice_lines",
    parentIdCol: "invoice_id",
    parent: "accounting.invoices",
    status: "enforced",
  },
  {
    child: "accounting.expense_lines",
    parentIdCol: "expense_id",
    parent: "accounting.expenses",
    status: "enforced",
  },
  {
    child: "accounting.bill_lines",
    parentIdCol: "bill_id",
    parent: "accounting.bills",
    status: "deferred",
    deferredTo: "db-integrity-hardening-0519 (owner-gated FK migration)",
  },
];

const SCOPE_COLS = ["operating_company_id", "tenant_id"];

function stripComments(sql) {
  return sql.replace(/--[^\n]*/g, "");
}

function loadCorpus() {
  if (!fs.existsSync(MIGRATIONS)) return "";
  return fs
    .readdirSync(MIGRATIONS)
    .filter((f) => f.endsWith(".sql"))
    .sort()
    .map((f) => stripComments(fs.readFileSync(path.join(MIGRATIONS, f), "utf8")))
    .join("\n");
}

/** Extract the balanced-paren body immediately following index `open` (which must point at "("). */
function balancedBody(sql, open) {
  let depth = 0;
  for (let i = open; i < sql.length; i += 1) {
    if (sql[i] === "(") depth += 1;
    else if (sql[i] === ")") {
      depth -= 1;
      if (depth === 0) return sql.slice(open + 1, i);
    }
  }
  return null;
}

/** All CREATE TABLE bodies for `child` (there can be several IF-NOT-EXISTS copies across migrations). */
function createBodies(corpus, child) {
  const childEsc = child.replace(/\./g, "\\.");
  const re = new RegExp(`CREATE\\s+TABLE\\s+(?:IF\\s+NOT\\s+EXISTS\\s+)?${childEsc}\\s*\\(`, "gi");
  const bodies = [];
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const open = corpus.indexOf("(", m.index);
    if (open >= 0) {
      const body = balancedBody(corpus, open);
      if (body) bodies.push(body);
    }
  }
  return bodies;
}

/** All `ALTER TABLE <child> ... ;` statement texts (single-statement bounded — never cross `;`). */
function alterStatements(corpus, child) {
  const childEsc = child.replace(/\./g, "\\.");
  const re = new RegExp(`ALTER\\s+TABLE\\s+(?:IF\\s+EXISTS\\s+)?${childEsc}\\b`, "gi");
  const out = [];
  let m;
  while ((m = re.exec(corpus)) !== null) {
    const end = corpus.indexOf(";", m.index);
    out.push(corpus.slice(m.index, end < 0 ? corpus.length : end));
  }
  return out;
}

/** True iff an ENFORCED FK on `child(parentIdCol) -> parent` exists, SCOPED TO the child table. */
export function hasEnforcedFk(corpus, child, parentIdCol, parent) {
  const parentEsc = parent.replace(/\./g, "\\.");
  const colEsc = parentIdCol.replace(/[^a-z0-9_]/gi, "");
  // (a) inline column definition inside the child's CREATE body: `<col> <type> ... REFERENCES <parent>(`
  const inline = new RegExp(`\\b${colEsc}\\b[^,()]*\\bREFERENCES\\s+${parentEsc}\\s*\\(`, "i");
  for (const body of createBodies(corpus, child)) {
    for (const part of body.split(",")) {
      if (inline.test(part)) return true;
    }
  }
  // (b) ALTER TABLE <child> ... ADD [CONSTRAINT ...] FOREIGN KEY (<col>) REFERENCES <parent>(
  const fk = new RegExp(`FOREIGN\\s+KEY\\s*\\(\\s*${colEsc}\\s*\\)\\s*REFERENCES\\s+${parentEsc}\\s*\\(`, "i");
  return alterStatements(corpus, child).some((stmt) => fk.test(stmt));
}

/** True if the child table's CREATE body declares one of its OWN scope columns. */
export function hasOwnScopeColumn(corpus, child) {
  for (const body of createBodies(corpus, child)) {
    if (SCOPE_COLS.some((c) => new RegExp(`\\b${c}\\b`, "i").test(body))) return true;
  }
  return false;
}

export function run() {
  const corpus = loadCorpus();
  const failures = [];
  const notes = [];
  for (const entry of SCOPE_INHERITANCE) {
    const fk = hasEnforcedFk(corpus, entry.child, entry.parentIdCol, entry.parent);
    if (entry.status === "enforced") {
      if (!fk) {
        failures.push(
          `${entry.child}.${entry.parentIdCol} is registered status:"enforced" but NO enforced FK -> ${entry.parent} was found in db/migrations/. This table has no data-integrity guarantee that its scope-inheritance parent exists — restore the FK (regression lock).`,
        );
      } else {
        notes.push(`OK        ${entry.child}.${entry.parentIdCol} -> ${entry.parent} (enforced FK present)`);
      }
    } else {
      // deferred: FK must still be absent; if present, force a registry promotion.
      if (fk) {
        failures.push(
          `${entry.child}.${entry.parentIdCol} now HAS an enforced FK -> ${entry.parent}, but the registry still lists it status:"deferred". PROMOTE it to status:"enforced" in verify-accounting-line-scope-inheritance.mjs so the ratchet reflects reality (the ${entry.deferredTo} gap has closed — lock it in).`,
        );
      } else {
        const ownScope = hasOwnScopeColumn(corpus, entry.child);
        notes.push(
          `DEFERRED  ${entry.child}.${entry.parentIdCol} -> ${entry.parent} — no FK yet (own scope col: ${ownScope ? "yes" : "NO"}); awaiting ${entry.deferredTo}`,
        );
      }
    }
  }
  return { failures, notes };
}

if (process.argv.includes("--selftest")) {
  const corpus = `
    CREATE TABLE accounting.invoice_lines (
      id uuid PRIMARY KEY,
      operating_company_id uuid NOT NULL REFERENCES org.companies(id),
      invoice_id uuid NOT NULL REFERENCES accounting.invoices(id) ON DELETE CASCADE
    );
    CREATE TABLE accounting.bill_lines (
      id uuid PRIMARY KEY,
      bill_id uuid NOT NULL
    );
    -- a same-named column on ANOTHER table must NOT count as bill_lines' FK:
    CREATE TABLE accounting.bill_payments (
      id uuid PRIMARY KEY,
      bill_id uuid NOT NULL REFERENCES accounting.bills(id)
    );
    ALTER TABLE accounting.expense_lines
      ADD CONSTRAINT fk_exp FOREIGN KEY (expense_id) REFERENCES accounting.expenses(id) ON DELETE RESTRICT;
  `;
  const checks = [
    ["invoice_lines inline FK", hasEnforcedFk(corpus, "accounting.invoice_lines", "invoice_id", "accounting.invoices") === true],
    ["invoice_lines own scope", hasOwnScopeColumn(corpus, "accounting.invoice_lines") === true],
    ["bill_lines no FK (scoped to child)", hasEnforcedFk(corpus, "accounting.bill_lines", "bill_id", "accounting.bills") === false],
    ["bill_lines no own scope", hasOwnScopeColumn(corpus, "accounting.bill_lines") === false],
    ["expense_lines ALTER FK", hasEnforcedFk(corpus, "accounting.expense_lines", "expense_id", "accounting.expenses") === true],
  ];
  const bad = checks.filter(([, ok]) => !ok).map(([label]) => label);
  if (bad.length) {
    console.error(`verify-accounting-line-scope-inheritance selftest FAIL: ${bad.join(", ")}`);
    process.exit(1);
  }
  console.log("verify-accounting-line-scope-inheritance selftest OK");
  process.exit(0);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { failures, notes } = run();
  for (const n of notes) console.log(`  ${n}`);
  if (failures.length) {
    console.error("verify:accounting-line-scope-inheritance FAIL:");
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(`verify:accounting-line-scope-inheritance OK — ${SCOPE_INHERITANCE.length} registered line tables match their declared FK-inheritance state`);
}
