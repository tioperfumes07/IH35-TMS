#!/usr/bin/env node
/**
 * LV-JE-LABEL-IGNORES-POPULATED-MEMO (class CLS-LINKAGE-ONEWAY) — the invoice-detail GL section
 * rendered "Journal entry - not visible" for a JE that was posted, linked and named.
 *
 * entityLabel was CORRECT and must not be touched: "<noun> - not visible" is the documented honest
 * fallback for id-present/name-absent. The defect was upstream — the payload selected je.id but not
 * je.memo, so the label never left the server.
 *
 * accounting.journal_entries has NO number/ref/doc column; `memo` IS the JE's human identity, and it
 * is populated on 1864 of 1864 rows on prod. So the invariant this guard enforces is:
 *
 *   if a SQL query has accounting.journal_entries joined AND exposes the JE id to a payload,
 *   it MUST also select that JE's memo — the label is one column away and free.
 *
 * Deliberately scoped to queries that ALREADY join journal_entries. Sites that expose a stored
 * journal_entry_id without the JE table in scope (expenses.routes.ts:252, the bills.service.ts
 * subquery) cannot select a memo and are correctly out of scope — flagging them would be noise that
 * gets the guard weakened later.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const LABEL = "3029-verify-je-payload-carries-label";
const SCAN_DIR = path.join(ROOT, "apps/backend/src");
const FRONTEND_CONSUMERS = [
  {
    file: "apps/frontend/src/pages/accounting/ExpensesListPage.tsx",
    required: /humanMemo\(r\.journal_entry_memo,\s*r\.id,/,
  },
  {
    file: "apps/frontend/src/pages/accounting/AccountingAuditTrailPage.tsx",
    required: /visibleDocumentLabel\(row\.memo,\s*row\.journal_entry_id,\s*"Journal entry"\)/,
  },
  {
    file: "apps/frontend/src/pages/accounting/InvoiceDetailPage.tsx",
    required: /entityLabel\(je\.memo,\s*je\.id,\s*"Journal entry"\)/,
  },
];

function fail(msg) {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
}

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__") continue;
      walk(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

/**
 * Split a source file into template-literal SQL blocks. A JE payload is built inside one backtick
 * block, so per-block scoping is what makes "joined here" and "selected here" the same question.
 */
function sqlBlocks(src) {
  return [...src.matchAll(/`([^`]*)`/g)]
    .map((m) => stripSqlComments(m[1]))
    .filter((b) => /\bSELECT\b/i.test(b));
}

/**
 * ★ Strip `--` comments BEFORE parsing. Caught by this guard's own selftest: an explanatory comment
 * containing the words "accounting.journal_entries has NO ..." made the alias regex capture "has"
 * from the prose instead of the real alias `je`. The block then looked like it exposed no JE id and
 * was silently skipped — so the guard would have missed the very defect it was written for, and
 * reported PASS. Prose is not SQL; it must never reach the matcher.
 */
function stripSqlComments(sql) {
  return sql
    .split("\n")
    .map((line) => line.replace(/--.*$/, ""))
    .join("\n");
}

function audit() {
  const problems = [];
  const files = walk(SCAN_DIR);
  let scanned = 0;

  for (const file of files) {
    const src = fs.readFileSync(file, "utf8");
    if (!src.includes("journal_entries")) continue;

    // ★ A backtick inside a SQL `--` comment TERMINATES the surrounding template literal, silently
    // fragmenting the query for every parser that reads it — including this guard. Found the hard way:
    // an explanatory comment written as `memo` split the block mid-sentence, the JE id vanished from
    // the matcher's view, and the guard reported PASS on a payload that had lost its label. Cheap to
    // detect, invisible and expensive otherwise, so it is enforced rather than remembered.
    src.split("\n").forEach((line, i) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("--") && line.includes("`")) {
        problems.push(
          `${path.relative(ROOT, file)}:${i + 1}: backtick inside a SQL comment — it ends the template literal and fragments the query for any parser. Use plain quotes in SQL comments.`
        );
      }
    });

    for (const block of sqlBlocks(src)) {
      // Only blocks that BOTH join accounting.journal_entries and expose its id as a payload field.
      // Anchored to FROM/JOIN so only a real table reference can supply the alias.
      const joinsJe = /\b(?:FROM|JOIN)\s+accounting\.journal_entries\s+(?:AS\s+)?(\w+)/i.exec(block);
      if (!joinsJe) continue;
      const alias = joinsJe[1];
      // LINEAGE-ROUTE-OMITS-JE-MEMO — the id can be exposed TWO shapes: `<je alias>.id::text AS
      // journal_entry_id` (the shape this guard originally matched), OR `<any other alias, typically
      // a postings/lines table>.journal_entry_uuid::text AS journal_entry_id` — a FK column on a
      // DIFFERENT joined table pointing at journal_entries, which is how
      // audit-trail/service.ts's listAccountingSourceLineage exposed it. That query joined
      // journal_entries, exposed the id via `jp.journal_entry_uuid`, and never selected je.memo — the
      // original matcher only ever checked the je-alias.id shape, so this defect was invisible to the
      // guard meant to catch exactly it.
      //
      // A THIRD shape (`<any alias>.journal_entry_id::text AS journal_entry_id` — a source table's own
      // stored FK column) was tried and reverted: it also matched CTE-chained queries where a `je`
      // alias joined earlier in the SAME backtick block is no longer in scope by the time the final
      // SELECT projects a derived journal_entry_id (e.g. home/revenue-gl-linkage.service.ts's
      // `linked_postings` CTE) — a shape this block-level matcher cannot safely distinguish from a
      // real same-scope reference without real SQL parsing. Left as a known gap rather than shipping a
      // guard that fails on unrelated, more complex queries it cannot correctly reason about.
      const exposesId =
        new RegExp(`\\b${alias}\\.id::text\\s+AS\\s+journal_entry_id`, "i").test(block) ||
        /\b\w+\.journal_entry_uuid::text\s+AS\s+journal_entry_id/i.test(block);
      if (!exposesId) continue;

      scanned += 1;
      const selectsMemo = new RegExp(`\\b${alias}\\.memo\\b`, "i").test(block);
      if (!selectsMemo) {
        problems.push(
          `${path.relative(ROOT, file)}: a query joins accounting.journal_entries (alias "${alias}") and returns ${alias}.id AS journal_entry_id but never selects ${alias}.memo — the JE renders as "Journal entry - not visible" though its label is one column away. Do NOT fix this in entityLabel; add the column here.`
        );
      }
    }
  }

  for (const consumer of FRONTEND_CONSUMERS) {
    const src = fs.readFileSync(path.join(ROOT, consumer.file), "utf8");
    if (!consumer.required.test(src)) {
      problems.push(`${consumer.file}: JE link discards the memo label supplied by its payload`);
    }
  }

  if (scanned === 0) {
    // If the matcher stops matching, this guard would pass forever while the class rots.
    problems.push(
      "scanned 0 qualifying JE payload queries — the matcher no longer recognises the shape (guard would be inert)"
    );
  }
  return { problems, scanned };
}

function selftest() {
  const target = path.join(ROOT, "apps/backend/src/accounting/invoices.routes.ts");
  const original = fs.readFileSync(target, "utf8");
  let planted = 0;

  const mutations = [
    ["memo dropped from the payload (the original defect)", (s) => s.replace(/^\s*je\.memo,\s*$/m, "")],
    ["memo renamed so the column is no longer selected", (s) => s.replace(/\bje\.memo,/, "je.status AS memo_placeholder,")],
  ];

  for (const [name, mutate] of mutations) {
    const broken = mutate(original);
    if (broken === original) {
      fs.writeFileSync(target, original);
      fail(`selftest INERT: mutation "${name}" did not apply — the guard proves nothing`);
    }
    // Restore BEFORE failing: process.exit() does not run finally blocks.
    fs.writeFileSync(target, broken);
    const stillClean = audit().problems.length === 0;
    fs.writeFileSync(target, original);
    if (stillClean) fail(`selftest: expected FAIL after mutation "${name}"`);
    planted += 1;
  }

  // LINEAGE-ROUTE-OMITS-JE-MEMO regression: proves the exposesId widening (jp.journal_entry_uuid
  // shape, not just <je alias>.id) actually fires — mutating audit-trail/service.ts's
  // listAccountingSourceLineage back to its pre-fix shape (no je.memo) must go red. Without this
  // fixture the widened regex could silently stop matching and the guard would report PASS forever.
  const lineageTarget = path.join(ROOT, "apps/backend/src/accounting/audit-trail/service.ts");
  const lineageOriginal = fs.readFileSync(lineageTarget, "utf8");
  const lineageBroken = lineageOriginal.replace(/^\s*je\.memo\s*$/m, "");
  if (lineageBroken === lineageOriginal) {
    fail(`selftest INERT: audit-trail/service.ts mutation did not apply — the guard proves nothing for this shape`);
  }
  fs.writeFileSync(lineageTarget, lineageBroken);
  const lineageStillClean = audit().problems.length === 0;
  fs.writeFileSync(lineageTarget, lineageOriginal);
  if (lineageStillClean) fail("selftest: expected FAIL after dropping je.memo from listAccountingSourceLineage (jp.journal_entry_uuid shape)");
  planted += 1;

  const clean = audit();
  if (clean.problems.length) fail(`selftest cleanup still red: ${clean.problems.join("; ")}`);

  for (const consumer of FRONTEND_CONSUMERS) {
    const target = path.join(ROOT, consumer.file);
    const original = fs.readFileSync(target, "utf8");
    const broken = original.replace(consumer.required, 'entityLabel(null, "lost-id", "Journal entry")');
    if (broken === original) fail(`selftest INERT: frontend mutation did not apply to ${consumer.file}`);
    fs.writeFileSync(target, broken);
    const stillClean = audit().problems.length === 0;
    fs.writeFileSync(target, original);
    if (stillClean) fail(`selftest: expected FAIL after ${consumer.file} discarded its JE memo`);
    planted += 1;
  }

  const afterFrontend = audit();
  if (afterFrontend.problems.length) fail(`selftest frontend cleanup still red: ${afterFrontend.problems.join("; ")}`);
  console.log(`[${LABEL}] SELFTEST PASS (${planted} planted failures detected)`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const { problems, scanned } = audit();
  if (problems.length) {
    for (const p of problems) console.error(` - ${p}`);
    fail(`${problems.length} problem(s)`);
  }
  console.log(`[${LABEL}] PASS — ${scanned} JE payload query(s) join journal_entries and all carry the memo label`);
}
