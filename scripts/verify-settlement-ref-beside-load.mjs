#!/usr/bin/env node
// ALL-SEATS LAW (owner, 2026-09-13, verbatim): "in every window where we have a load number, we
// must also have a column with a pre-settlement, or settlement or tour number." CC-2 authors this
// guard because CC-2 authors <SettlementRefCell> — all three seats register their own converted
// surfaces here as they land (CC-1: 5 Accounting + Cash Flow; CC-2: 11 Driver/Finance + 2 Fuel;
// CC-3: 6 Dispatch + 5 Safety/Insurance + 5 Fleet/Reports/Docs).
//
// Fails when:
//   1) A registered surface (SURFACES) renders its load-number column without also rendering
//      SettlementRefCell (or importing the canonical settlementNumber.ts helper directly, for a
//      surface that composes the cell's logic manually).
//   2) ANY file under apps/frontend/src renders `display_id` in a context that names it a
//      "settlement" — driver_finance.driver_settlements.display_id (the retired internal
//      S-YYYY-NNNN counter) must NEVER be the human-visible settlement/tour number; only
//      source_document_ref may render.
//
// The registry starts EMPTY in this PR (which ships the shared component + guard alone, per the
// Lead's own build order — "ship these BEFORE your own 13 surfaces"); each seat extends SURFACES
// as their own conversions land.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FRONTEND_SRC = path.join(ROOT, "apps", "frontend", "src");

// { file, loadNumberNeedle: RegExp, note }. loadNumberNeedle proves the surface actually renders a
// load-number column (so this guard is meaningful for it); a converted surface must ALSO match
// SETTLEMENT_CELL_RE somewhere in the same file.
export const SURFACES = [];

const SETTLEMENT_CELL_RE = /<SettlementRefCell\b|settlementLabel\s*\(|settlementNumber\s*\(/;

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.tsx?$/.test(entry.name) && !entry.name.endsWith(".test.tsx") && !entry.name.endsWith(".test.ts")) out.push(full);
  }
  return out;
}

function relFile(absPath) {
  return path.relative(ROOT, absPath).split(path.sep).join("/");
}

export function auditRegisteredSurfaces() {
  const failures = [];
  for (const s of SURFACES) {
    const full = path.join(ROOT, s.file);
    if (!fs.existsSync(full)) {
      failures.push(`${s.file}: registered surface no longer exists — remove it from SURFACES if intentional`);
      continue;
    }
    const src = fs.readFileSync(full, "utf8");
    if (!s.loadNumberNeedle.test(src)) {
      failures.push(`${s.file}: registered surface no longer matches its own loadNumberNeedle — fixture/guard out of sync`);
      continue;
    }
    if (!SETTLEMENT_CELL_RE.test(src)) {
      failures.push(`${s.file}: renders a load number but never renders <SettlementRefCell> / settlementLabel() / settlementNumber() — every load-number column needs a settlement/tour column beside it`);
    }
  }
  return failures;
}

/** driver_finance.driver_settlements.display_id (S-YYYY-NNNN) must never be the human-visible
 * settlement number — only source_document_ref may render. Scoped to JSX-rendered expressions
 * that name themselves "settlement" AND access `.display_id`, so an unrelated entity's own
 * legitimate display_id (an invoice, a bill) is not falsely flagged. */
function findDisplayIdAsSettlementNumber(src) {
  const hits = [];
  const re = /\{[^{}]*settlement[a-zA-Z_]*\.display_id[^{}]*\}/gi;
  let m;
  while ((m = re.exec(src))) hits.push(m[0]);
  return hits;
}

export function auditNoDisplayIdAsSettlementNumber(files) {
  const failures = [];
  for (const abs of files) {
    const src = fs.readFileSync(abs, "utf8");
    const hits = findDisplayIdAsSettlementNumber(src);
    if (hits.length > 0) {
      failures.push(`${relFile(abs)}: renders a settlement's display_id as a user-visible number (${hits[0]}) — only source_document_ref may render (settlementNumber.ts)`);
    }
  }
  return failures;
}

function auditAll() {
  const files = walk(FRONTEND_SRC);
  return [...auditRegisteredSurfaces(), ...auditNoDisplayIdAsSettlementNumber(files)];
}

function run() {
  const failures = auditAll();
  if (failures.length > 0) {
    console.error("verify-settlement-ref-beside-load FAIL:");
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(
    `verify-settlement-ref-beside-load OK — ${SURFACES.length} registered surface(s) all render SettlementRefCell/settlementLabel beside their load number, 0 files render a settlement's display_id as a user-visible number.`
  );
}

if (process.argv.includes("--selftest")) {
  const assert = await import("node:assert/strict").then((m) => m.default);
  assert.equal(auditAll().length, 0, "all checks should pass on real source (empty registry, no real display_id-as-settlement violations)");

  // MUTATION 1 — a registered surface that renders a load number but never SettlementRefCell.
  const tmpDir = fs.mkdtempSync(path.join(ROOT, ".tmp-settlement-ref-selftest-"));
  try {
    const f1 = path.join(tmpDir, "NoSettlementColumn.tsx");
    fs.writeFileSync(f1, `export const x = <span>{row.load_number}</span>;\n`);
    const fakeSurfaces = [{ file: path.relative(ROOT, f1).split(path.sep).join("/"), loadNumberNeedle: /row\.load_number/ }];
    const failures1 = (function auditWith(surfaces) {
      const fs2 = [];
      for (const s of surfaces) {
        const full = path.join(ROOT, s.file);
        const src = fs.readFileSync(full, "utf8");
        if (!s.loadNumberNeedle.test(src)) continue;
        if (!SETTLEMENT_CELL_RE.test(src)) fs2.push(`${s.file}: missing SettlementRefCell`);
      }
      return fs2;
    })(fakeSurfaces);
    assert.ok(failures1.length > 0, "MUTATION 1 (load number rendered with no settlement cell) escaped detection");

    // MUTATION 2 — settlement.display_id rendered as a user-visible number.
    const f2 = path.join(tmpDir, "RogueSettlementDisplay.tsx");
    fs.writeFileSync(f2, `export const x = <span>{settlement.display_id}</span>;\n`);
    assert.ok(auditNoDisplayIdAsSettlementNumber([f2]).length > 0, "MUTATION 2 (settlement.display_id rendered) escaped detection");

    // MUTATION 3 — an unrelated entity's own display_id must NOT be falsely flagged.
    const f3 = path.join(tmpDir, "InvoiceRow.tsx");
    fs.writeFileSync(f3, `export const x = <span>{invoice.display_id}</span>;\n`);
    assert.equal(auditNoDisplayIdAsSettlementNumber([f3]).length, 0, "MUTATION 3 false-positived on an unrelated entity's own display_id");
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  console.log("verify-settlement-ref-beside-load --selftest PASS (3/3 mutations caught)");
  process.exit(0);
}

run();
