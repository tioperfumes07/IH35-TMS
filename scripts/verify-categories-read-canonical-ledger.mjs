#!/usr/bin/env node
/**
 * LST-PICKER-02 — the expense-category picker must read the CANONICAL GL ledger.
 *
 * An expense "category" IS a general-ledger account. /api/v1/accounting/categories was reading
 * mdata.qbo_accounts — the read-only QBO MIRROR — while an in-file comment claimed it read canonical.
 * Read and write disagreed and the comment was the lie, so a category created in the app was
 * invisible in the picker, and USMCA's chart of accounts was understated by roughly 70% (canonical
 * 1,233 active vs mirror 365).
 *
 * This guard pins BOTH directions, because each is a distinct defect:
 *   · it must read catalogs.accounts (canonical), and
 *   · it must NOT read mdata.qbo_accounts (a RETIRE mirror) or catalogs.items.
 *
 * catalogs.items is called out explicitly because the original audit instructed repointing there.
 * items is products/services; accounts is the posting ledger. Booking an expense against a product
 * record is a chart-of-accounts integrity break, so that specific wrong answer is guarded by name.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const ROUTE = join(ROOT, "apps/backend/src/accounting/items.routes.ts");
const LABEL = "verify-categories-read-canonical-ledger";

const strip = (s) => s.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/** Isolate the categories handler so sibling endpoints in the same file are not misread. */
export function categoriesHandler(src) {
  const start = src.indexOf('"/api/v1/accounting/categories"');
  if (start === -1) return null;
  const next = src.indexOf("app.get(", start + 10);
  return src.slice(start, next === -1 ? src.length : next);
}

export function run(sourceOverride) {
  const raw = sourceOverride ?? readFileSync(ROUTE, "utf8");
  const handler = categoriesHandler(strip(raw));
  if (!handler) {
    return { ok: false, message: `${LABEL} FAIL: could not locate the /accounting/categories handler — the guard lost its subject.` };
  }

  const problems = [];
  if (!/FROM\s+catalogs\.accounts\b/i.test(handler)) {
    problems.push("does not read catalogs.accounts — the canonical GL posting ledger");
  }
  if (/FROM\s+mdata\.qbo_accounts\b/i.test(handler)) {
    problems.push("reads mdata.qbo_accounts — a read-only QBO MIRROR, not canonical (RETIRE target)");
  }
  if (/FROM\s+catalogs\.items\b/i.test(handler)) {
    problems.push(
      "reads catalogs.items — products/services, NOT the GL ledger. Booking an expense against a " +
        "product record is a chart-of-accounts integrity defect"
    );
  }

  const ok = problems.length === 0;
  return {
    ok,
    message: ok
      ? `${LABEL} OK — /accounting/categories reads canonical catalogs.accounts, and neither the QBO mirror nor catalogs.items.`
      : `${LABEL} FAIL — /accounting/categories ${problems.join("; ")}.`,
  };
}

function selftest() {
  const real = readFileSync(ROUTE, "utf8");
  if (!run(real).ok) {
    console.error(`SELFTEST FAIL: the real route is already red.\n${run(real).message}`);
    process.exit(1);
  }
  console.log("  ok: the real route passes");

  const cases = [
    { name: "flipped back to the QBO mirror", from: "FROM catalogs.accounts", to: "FROM mdata.qbo_accounts", expect: /QBO MIRROR/ },
    { name: "flipped to catalogs.items (the audit's wrong answer)", from: "FROM catalogs.accounts", to: "FROM catalogs.items", expect: /chart-of-accounts integrity defect/ },
  ];
  for (const c of cases) {
    const mutated = real.replace(c.from, c.to);
    if (mutated === real) {
      console.error(`SELFTEST FAIL: anchor for "${c.name}" not found.`);
      process.exit(1);
    }
    const r = run(mutated);
    if (r.ok || !c.expect.test(r.message)) {
      console.error(`SELFTEST FAIL: "${c.name}" was NOT caught.\n${r.message}`);
      process.exit(1);
    }
    console.log(`  caught: ${c.name}`);
  }
  console.log("SELFTEST PASS — canonical enforced, and both wrong sources rejected by name.");
}

if (process.argv.includes("--selftest")) selftest();
else {
  const r = run();
  console.log(r.message);
  if (!r.ok) process.exit(1);
}
