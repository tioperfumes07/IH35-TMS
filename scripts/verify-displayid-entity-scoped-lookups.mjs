#!/usr/bin/env node
// GUARD (CLS-DISPLAYID-UNSCOPED): a display_id may never be an EQUALITY lookup key without an
// operating_company_id predicate in the same statement.
//
// WHY. display_id is UNIQUE per (operating_company_id, display_id), NOT globally — every entity's
// sequence restarts at 00001 independently, BY DESIGN. Verified live on prod 2026-08-05:
// accounting.invoices collides on four numbers across TRANSP and USMCA, including INV-2026-00004,
// which exists on USMCA (test) AND on TRANSP (real, paid). So `WHERE display_id = $1` alone can
// resolve the WRONG ENTITY'S ROW — and if the caller then voids, pays or reclassifies it, the money
// moves on somebody else's books. PERMANENT LAW B says it outright: void by UUID, NEVER display_id.
//
// This is a FUTURE-regression ratchet, deliberately. A full sweep on 2026-08-05, re-verified against
// main before this guard was written, found every existing call site correctly co-scoped: the
// ILIKE search filters in invoices/payments/factoring-advances/cash-advances sit inside
// withCompanyScope-wrapped list endpoints, and the settlement-disputes reads SELECT display_id keyed
// on id (safe direction — reading the label, not keying on it). Zero live offenders. The guard exists
// so the next one is caught at review rather than in the ledger.
//
// WHAT IS NOT FLAGGED, and why each is safe:
//   · ILIKE / LIKE  — a search filter layered on an already-scoped base query, not a resolver.
//   · SELECT display_id ... WHERE id = $1 — reads the label BY uuid; the safe direction.
//   · NOT ILIKE 'DEMO-%' — a fixture exclusion, not an entity lookup.
// Only an EQUALITY or IN lookup ON display_id, with no operating_company_id anywhere in the same
// statement, is a defect.
//
// --selftest proves it can go red.

import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-displayid-entity-scoped-lookups";
const ROOTS = ["apps/backend/src"];

// display_id on the LEFT of an equality/IN — i.e. used as the key.
const LOOKUP = /\b(?:[a-z_]+\.)?display_id\s*(?:=|\bIN\b)/i;
const SCOPED = /operating_company_id/i;
// A statement is any backtick-quoted SQL block; good enough because every query in this codebase is
// a template literal, and a false negative here is strictly safer than inventing a parser.
const SQL_BLOCK = /`([^`]*)`/gs;

function scan(roots) {
  const offenders = [];
  let statements = 0;
  const walk = (dir) => {
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        if (e.name === "node_modules" || e.name === "dist" || e.name === "__tests__") continue;
        walk(p);
      } else if (e.name.endsWith(".ts") && !e.name.includes(".test.")) {
        const src = fs.readFileSync(p, "utf8");
        for (const m of src.matchAll(SQL_BLOCK)) {
          const sql = m[1];
          if (!/display_id/i.test(sql)) continue;
          statements++;
          if (!LOOKUP.test(sql)) continue;          // not a lookup key
          if (SCOPED.test(sql)) continue;           // co-scoped — correct
          const line = src.slice(0, m.index).split("\n").length;
          offenders.push(`${p}:${line}: display_id used as a lookup key with no operating_company_id predicate`);
        }
      }
    }
  };
  for (const r of roots) walk(r);
  return { offenders, statements };
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(process.env.TMPDIR || "/tmp", "didsel-"));
  const w = (name, body) => fs.writeFileSync(path.join(tmp, name), body);

  // MUST be caught: equality lookup on display_id, no opco predicate.
  w("bad.ts", "const q = `SELECT id FROM accounting.invoices WHERE display_id = $1 LIMIT 1`;\n");
  if (scan([tmp]).offenders.length !== 1) {
    console.error(`${LABEL}: SELFTEST FAIL — unscoped display_id lookup not caught`); process.exit(1);
  }
  // MUST pass: same lookup, co-scoped.
  w("bad.ts", "const q = `SELECT id FROM accounting.invoices WHERE operating_company_id = $1 AND display_id = $2`;\n");
  if (scan([tmp]).offenders.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — co-scoped lookup wrongly flagged`); process.exit(1);
  }
  // MUST pass: ILIKE search filter (layered on a scoped base query, not a resolver).
  w("bad.ts", "const q = `(i.display_id ILIKE $1 OR c.customer_name ILIKE $1)`;\n");
  if (scan([tmp]).offenders.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — ILIKE search filter wrongly flagged`); process.exit(1);
  }
  // MUST pass: reading display_id BY uuid — the safe direction.
  w("bad.ts", "const q = `SELECT display_id FROM driver_finance.driver_settlements WHERE id = $1`;\n");
  if (scan([tmp]).offenders.length !== 0) {
    console.error(`${LABEL}: SELFTEST FAIL — read-by-uuid wrongly flagged`); process.exit(1);
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log(`${LABEL}: selftest PASS — RED on an unscoped display_id lookup; GREEN on co-scoped, on an ILIKE search filter, and on reading display_id by uuid.`);
}

const { offenders, statements } = scan(ROOTS);
if (offenders.length) {
  console.error(`${LABEL} FAILED — ${offenders.length} display_id lookup(s) with no entity predicate:\n`);
  for (const o of offenders) console.error(`  - ${o}`);
  console.error(
    `\ndisplay_id is UNIQUE per (operating_company_id, display_id), NOT globally — each entity's\n` +
      `sequence restarts at 00001. INV-2026-00004 exists on BOTH USMCA (test) and TRANSP (real, paid).\n` +
      `Resolving by display_id alone can hit the wrong entity's row. Add operating_company_id to the\n` +
      `predicate, or key on the UUID (PERMANENT LAW B: void by UUID, never display_id).\n`
  );
  process.exit(1);
}
console.log(`${LABEL} OK — ${statements} display_id statement(s) scanned, none keyed without an entity predicate.`);
