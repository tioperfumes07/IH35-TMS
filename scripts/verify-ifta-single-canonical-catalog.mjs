#!/usr/bin/env node
/**
 * C11 — there must be exactly ONE canonical IFTA jurisdiction catalog.
 *
 * The defect this locks: two tables both looked like "the IFTA jurisdiction list".
 *   · catalogs.fuel_tax_jurisdictions — WIRED to the fuel route and populated (58 IFTA members per
 *     company, seeded by FUEL-07).
 *   · catalogs.ifta_states — UNWIRED and EMPTY on prod (count(*) = 0 AND n_live_tup = 0), despite a
 *     spec asserting it had been seeded. It has a migration, not rows.
 *
 * Two catalogs claiming the same meaning is a permanent split-brain risk: a future block wires the
 * wrong one and files an IFTA return against a jurisdiction set nobody maintains. The retirement is
 * stop-write + deprecated COMMENT (never a DROP — Rule 07), and this guard keeps it from silently
 * reversing by asserting that no application code reads or writes the retired table.
 *
 * Deliberately NOT asserted here: the REVOKE itself. Grants live in the database, not the repo, so
 * a static guard cannot see them — claiming otherwise would be exactly the fake-green this codebase
 * has been burned by. The revoke is proven by the migration's live application, recorded in its PR.
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const RETIRED = "ifta_states";
const CANONICAL = "fuel_tax_jurisdictions";

/** Application source only. Migrations legitimately name the retired table — that is its history. */
const APP_DIRS = ["apps/backend/src", "apps/frontend/src", "apps/driver-pwa/src"];

function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) out.push(full);
  }
  return out;
}

export function run() {
  const files = APP_DIRS.flatMap((d) => walk(join(ROOT, d)));
  const offenders = [];
  for (const f of files) {
    const text = readFileSync(f, "utf8");
    if (new RegExp(`\\b${RETIRED}\\b`).test(text)) offenders.push(relative(ROOT, f));
  }

  // The canonical table must still be wired — retiring the twin is only safe while the real one works.
  const canonicalWired = files.some((f) => new RegExp(`\\b${CANONICAL}\\b`).test(readFileSync(f, "utf8")));

  const problems = [];
  if (offenders.length > 0) {
    problems.push(
      `application code references the RETIRED catalog "${RETIRED}": ${offenders.join(", ")}. ` +
        `Canonical is catalogs.${CANONICAL} — wiring the retired twin recreates the split-brain that ` +
        `retirement removed.`
    );
  }
  if (!canonicalWired) {
    problems.push(
      `no application code references the canonical catalog "${CANONICAL}" — the twin was retired on ` +
        `the basis that this one is the wired path, so losing it would leave NO wired IFTA catalog.`
    );
  }

  const ok = problems.length === 0;
  return {
    ok,
    scanned: files.length,
    offenders,
    message: ok
      ? `PASS: ${files.length} app source files scanned — canonical catalogs.${CANONICAL} is wired and ` +
        `the retired catalogs.${RETIRED} has no application consumer.`
      : `FAIL:\n  - ${problems.join("\n  - ")}`,
  };
}

/** Plants a reference to the retired table into real app source and requires it to be caught. */
function selftest() {
  const baseline = run();
  if (!baseline.ok) {
    console.error(`SELFTEST FAIL: repository is already red before any mutation.\n${baseline.message}`);
    process.exit(1);
  }

  const target = join(ROOT, "apps/backend/src/catalogs/fuel/index.ts");
  let original;
  try {
    original = readFileSync(target, "utf8");
  } catch {
    console.error(`SELFTEST FAIL: expected fuel catalog source at ${target} — the guard lost its subject.`);
    process.exit(1);
  }

  let caught;
  try {
    writeFileSync(target, `${original}\n// selftest: ${RETIRED}\n`, "utf8");
    caught = run();
  } finally {
    writeFileSync(target, original, "utf8");
  }

  if (caught.ok || !caught.offenders.some((o) => o.endsWith("catalogs/fuel/index.ts"))) {
    console.error(`SELFTEST FAIL: a planted reference to the retired table was NOT caught.\n${caught.message}`);
    process.exit(1);
  }

  const after = run();
  if (!after.ok) {
    console.error(`SELFTEST FAIL: restore did not return the repository to green.\n${after.message}`);
    process.exit(1);
  }
  console.log("SELFTEST PASS: a re-wired reference to the retired catalog is detected, and restore is green.");
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (!result.ok) process.exit(1);
}
