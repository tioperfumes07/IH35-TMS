#!/usr/bin/env node
/**
 * BILL-DISPLAY-ID-01 — a bill's human reference must come from `bill_number`, never from
 * `display_id` or `id::text`.
 *
 * WHY: `accounting.bills.display_id` is NULL on all 16,236 rows on prod. Every reader that leans on
 * it produces a different kind of wrong, and each looked fine in code review:
 *   - Exhibit F interpolated it into a template literal -> the literal string "Bill null" on every
 *     bill row of a Chapter 11 court schedule.
 *   - The cash-advance picker did COALESCE(display_id, id::text) -> the RAW UUID for every option,
 *     so an operator linking an advance to a bill could not tell two bills apart except by amount.
 *   - bank-recon matched on COALESCE(display_id, bill_number, ...) -> correct ONLY by accident,
 *     because the null falls through. The precedence was still backwards.
 *
 * A bill is a RECEIVED VENDOR DOCUMENT. `bill_number` is the vendor's own reference (e.g.
 * "13401-5723") and is what a trustee, auditor, creditor or reconciler matches against — the same
 * choice QuickBooks makes. accounting/transaction-register already read it first; this guard makes
 * that the enforced rule rather than one team's good habit.
 *
 * RULE: in any SQL that selects from accounting.bills, if `display_id` or `id::text` is surfaced as
 * a human-facing value, `bill_number` must appear ahead of it in the same COALESCE. Selecting
 * `display_id` as a raw passthrough column is fine — this is about what is shown to a person.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const SRC = join(ROOT, "apps/backend/src");
const LABEL = "verify-bill-human-reference";

/**
 * Aliases that put the value in front of a human — a court exhibit row, a picker option, a
 * reconciler's memo column. These are the ones that must resolve bill_number first.
 */
const HUMAN_LABEL_ALIAS = /(description|label|memo|display_id|display_name|reference|title|caption|name)/i;

/** Internal keys, where a uuid is the correct choice and bill_number would be wrong. */
const INTERNAL_KEY_ALIAS = /(dedupe|match|join|group|sort|hash|cache)_?key$|^key$/i;

function stripComments(s) {
  return s.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");
}

/**
 * COALESCE(...) groups that surface a bill's display_id / id::text as a human value.
 *
 * ATTRIBUTION IS THE HARD PART. A naive "scan forward from SELECT until FROM accounting.bills"
 * window mis-attributes across UNION branches: it will pick up a fuel branch's COALESCE and blame
 * it on the bills branch that appears later in the same statement. That produced 2 findings, both
 * false, on first run. So instead: locate each `FROM accounting.bills [alias]`, scan BACKWARD to
 * that branch's own SELECT, and only consider column references actually bound to the bills table —
 * `alias.display_id` when aliased, bare `display_id` when not.
 */
export function auditSql(rel, rawSrc) {
  const problems = [];
  const src = stripComments(rawSrc);

  for (const f of src.matchAll(/FROM\s+accounting\.bills\b(?:\s+(?:AS\s+)?([a-z][a-z0-9_]*))?/gi)) {
    const tableAlias = f[1] && !/^(where|order|group|left|inner|join|on|limit|union)$/i.test(f[1]) ? f[1] : null;

    // this branch's own SELECT — the nearest one before this FROM
    const before = src.slice(0, f.index);
    const selIdx = before.toUpperCase().lastIndexOf("SELECT");
    if (selIdx === -1) continue;
    const block = src.slice(selIdx, f.index);
    const line = src.slice(0, selIdx).split("\n").length;

    // Only columns bound to the bills table count.
    const col = (name) =>
      tableAlias
        ? new RegExp(`\\b${tableAlias}\\.${name}\\b`, "i")
        : new RegExp(`(?<![.\\w])${name}\\b`, "i");
    const displayRe = col("display_id");
    const idCastRe = tableAlias
      ? new RegExp(`\\b${tableAlias}\\.id\\s*::\\s*text\\b`, "i")
      : /(?<![.\w])id\s*::\s*text\b/i;
    const billNoRe = col("bill_number");

    for (const c of block.matchAll(/COALESCE\s*\(([\s\S]{0,300}?)\)\s*(?:::[a-z]+)?\s*AS\s+([a-z_]+)/gi)) {
      const args = c[1];
      const alias = c[2];
      const mentionsDisplay = displayRe.test(args);
      const mentionsIdCast = idCastRe.test(args);
      if (!mentionsDisplay && !mentionsIdCast) continue;

      // The rule is about what a PERSON is shown, not about internal keys. A uuid is a perfectly
      // good dedupe/join key — driver-finance/settlements.service.ts legitimately does
      // COALESCE(l.id::text, ab.id::text) AS dedupe_key to collapse two sources. Flagging that
      // would be a false positive, and a guard that cries wolf gets ignored.
      // A COALESCE used inside a JOIN predicate has no `AS alias` at all, so it is already out of
      // scope by construction.
      if (!HUMAN_LABEL_ALIAS.test(alias) || INTERNAL_KEY_ALIAS.test(alias)) continue;

      const billNoAt = args.search(billNoRe);
      const displayAt = args.search(displayRe);
      const idCastAt = args.search(idCastRe);

      if (billNoAt === -1) {
        problems.push(
          `${rel}:${line} COALESCE(...) AS ${alias} surfaces ${mentionsIdCast ? "id::text" : "display_id"} ` +
            `with NO bill_number fallback — bills.display_id is NULL on every row, so this renders a raw uuid ` +
            `or "null" to a person. Put NULLIF(bill_number,'') first.`
        );
        continue;
      }
      if (displayAt !== -1 && billNoAt > displayAt) {
        problems.push(
          `${rel}:${line} COALESCE(...) AS ${alias} puts display_id BEFORE bill_number — backwards. ` +
            `bill_number is the vendor's own reference and must win.`
        );
      }
      if (idCastAt !== -1 && billNoAt > idCastAt) {
        problems.push(
          `${rel}:${line} COALESCE(...) AS ${alias} puts id::text BEFORE bill_number — a uuid must never ` +
            `outrank the vendor reference.`
        );
      }
    }
  }
  return problems;
}

function walk(dir, out = []) {
  for (const n of readdirSync(dir)) {
    const f = join(dir, n);
    if (statSync(f).isDirectory()) {
      if (n === "__tests__") continue;
      walk(f, out);
    } else if (n.endsWith(".ts") && !n.endsWith(".test.ts") && !n.endsWith(".d.ts")) out.push(f);
  }
  return out;
}

function auditTree() {
  const problems = [];
  for (const file of walk(SRC)) {
    const src = readFileSync(file, "utf8");
    if (!/accounting\.bills/i.test(src)) continue;
    problems.push(...auditSql(relative(ROOT, file), src));
  }
  return problems;
}

function selftest() {
  const failures = [];

  // 1. The cash-advance defect: id::text with no bill_number. MUST be caught.
  const uuidShape = `
    const r = await c.query(\`
      SELECT id, COALESCE(display_id, id::text) AS display_id, vendor_id
      FROM accounting.bills WHERE operating_company_id = $1\`);`;
  if (!auditSql("planted.ts", uuidShape).some((p) => /NO bill_number fallback/.test(p)))
    failures.push("case1 FAIL — COALESCE(display_id, id::text) with no bill_number not caught");

  // 2. The bank-recon shape: bill_number present but AFTER display_id. MUST be caught.
  const backwards = `
    const r = await c.query(\`
      SELECT b.id::text, COALESCE(b.display_id, b.bill_number, b.memo)::text AS memo
      FROM accounting.bills b WHERE b.operating_company_id = $1\`);`;
  if (!auditSql("planted.ts", backwards).some((p) => /BEFORE bill_number/.test(p)))
    failures.push("case2 FAIL — display_id-before-bill_number precedence not caught");

  // 3. The CORRECTED shape must NOT be flagged.
  const good = `
    const r = await c.query(\`
      SELECT b.id, COALESCE(NULLIF(b.bill_number,''), b.display_id, 'Bill') AS description
      FROM accounting.bills b WHERE b.operating_company_id = $1\`);`;
  const goodHits = auditSql("planted.ts", good);
  if (goodHits.length !== 0) failures.push(`case3 FAIL — corrected shape flagged: ${goodHits.join("; ")}`);

  // 4. A raw passthrough select of display_id (not a human label) must NOT be flagged.
  const passthrough = `
    const r = await c.query(\`
      SELECT b.id, b.display_id, b.amount_cents FROM accounting.bills b WHERE b.id = $1\`);`;
  if (auditSql("planted.ts", passthrough).length !== 0)
    failures.push("case4 FAIL — raw passthrough select of display_id should not be flagged");

  // 5. The real tree must be clean.
  const tree = auditTree();
  if (tree.length !== 0) failures.push(`case5 FAIL — real source flagged: ${tree.join(" | ")}`);

  if (failures.length) {
    for (const f of failures) console.error(`  ✗ ${LABEL}: ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: selftest PASS — uuid-fallback and backwards-precedence caught; corrected shape and raw passthrough clean`);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const problems = auditTree();
  if (problems.length) {
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(`${LABEL} OK — every human-facing bill reference resolves bill_number before display_id/uuid`);
}

main();
