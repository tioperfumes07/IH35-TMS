#!/usr/bin/env node
/**
 * SAF-B14 — every safety catalog must be reachable from a CREATOR, not only from its own list page.
 *
 * The defect this locks: `catalogs.civil_fine_types` (57 live rows) and `catalogs.dot_violation_types`
 * (213 live rows) were each referenced by exactly one file — the list page that edits the catalog.
 * No creator consumed either, so the fine creator and the HOS violation creator both took the
 * violation as FREE TEXT. A catalog nothing writes against is decoration: two officers typing
 * "11 hour" and "11-hour rule" produce two different violations to FMCSA reporting, and
 * `safety.civil_fines.violation_code` stayed NULL on every row even though the create route has
 * always accepted it.
 *
 * A list page proves the catalog can be MAINTAINED. Only a creator proves it is USED. This guard
 * asserts the second, which is the part that kept silently not happening.
 *
 * Denominator rule: the catalog set is discovered from the API module, never hardcoded — a new
 * safety catalog is in scope the moment it is added, and the count is printed so "0 unbound" can
 * always be read as "0 of N".
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
const API_FILE = join(ROOT, "apps/frontend/src/api/catalogs-safety.ts");
const SRC_DIR = join(ROOT, "apps/frontend/src");

/** A file that only MAINTAINS the catalog, so it cannot count as proof the catalog is used. */
function isMaintenanceOnly(relPath) {
  return (
    relPath.includes("/pages/lists/") ||
    relPath.includes("__tests__") ||
    relPath.endsWith("api/catalogs-safety.ts")
  );
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (entry === "node_modules" || entry === "dist") continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(entry)) {
      out.push(full);
    }
  }
  return out;
}

export function run() {
  const api = readFileSync(API_FILE, "utf8");
  const listFns = [...api.matchAll(/^export function (list[A-Za-z0-9_]+)\s*\(/gm)].map((m) => m[1]);

  if (listFns.length === 0) {
    return {
      ok: false,
      total: 0,
      unbound: [],
      message:
        "FAIL: discovered ZERO catalog list functions in api/catalogs-safety.ts — the guard lost its " +
        "subject and would pass vacuously. Fix the discovery pattern, do not ignore this.",
    };
  }

  const files = walk(SRC_DIR).filter((f) => !isMaintenanceOnly(relative(ROOT, f)));
  const sources = files.map((f) => ({ path: relative(ROOT, f), text: readFileSync(f, "utf8") }));

  const unbound = [];
  const bound = [];
  for (const fn of listFns) {
    const consumers = sources.filter((s) => new RegExp(`\\b${fn}\\b`).test(s.text)).map((s) => s.path);
    if (consumers.length === 0) unbound.push(fn);
    else bound.push({ fn, consumers });
  }

  const ok = unbound.length === 0;
  return {
    ok,
    total: listFns.length,
    unbound,
    bound,
    message: ok
      ? `PASS: ${bound.length} of ${listFns.length} safety catalogs are consumed by a creator (not just their own list page).`
      : `FAIL: ${unbound.length} of ${listFns.length} safety catalogs are ORPHANED — reachable only from ` +
        `their own list page, so the creator still takes free text: ${unbound.join(", ")}. ` +
        `Bind each to the surface that CREATES the record it classifies.`,
  };
}

/**
 * The selftest re-plants the ACTUAL defect into the REAL creator files (not a fixture) and requires
 * the guard to catch it, then restores them byte-for-byte. A selftest against a synthetic string
 * proves only that the regex compiles; this proves the guard still sees the repository it guards.
 */
function selftest() {
  const targets = [
    { path: join(ROOT, "apps/frontend/src/pages/safety/components/FineCreateModal.tsx"), fn: "listCivilFineTypes" },
    { path: join(ROOT, "apps/frontend/src/pages/safety/tabs/HOSViolationsTab.tsx"), fn: "listDotViolationTypes" },
  ];
  const originals = targets.map((t) => ({ ...t, text: readFileSync(t.path, "utf8") }));

  const clean = run();
  if (!clean.ok) {
    console.error("SELFTEST FAIL: the repository is already failing the guard before any mutation.");
    process.exit(1);
  }

  let caught;
  try {
    for (const o of originals) {
      if (!o.text.includes(o.fn)) {
        console.error(`SELFTEST FAIL: ${o.fn} is not present in ${o.path} — the mutation would be a no-op.`);
        process.exit(1);
      }
      writeFileSync(o.path, o.text.replaceAll(o.fn, "__SELFTEST_UNBOUND__"), "utf8");
    }
    caught = run();
  } finally {
    for (const o of originals) writeFileSync(o.path, o.text, "utf8");
  }

  if (caught.ok) {
    console.error("SELFTEST FAIL: both creator bindings were removed and the guard still passed.");
    process.exit(1);
  }
  const missed = originals.filter((o) => !caught.unbound.includes(o.fn));
  if (missed.length > 0) {
    console.error(`SELFTEST FAIL: guard did not name ${missed.map((m) => m.fn).join(", ")}.`);
    process.exit(1);
  }
  const after = run();
  if (!after.ok) {
    console.error("SELFTEST FAIL: restore did not return the repository to green.");
    process.exit(1);
  }
  console.log(`SELFTEST PASS: unbinding both creators was caught (${caught.unbound.join(", ")}) and restore is green.`);
}

if (process.argv.includes("--selftest")) {
  selftest();
} else {
  const result = run();
  console.log(result.message);
  if (result.bound) {
    for (const b of result.bound) console.log(`  ${b.fn} -> ${b.consumers.join(", ")}`);
  }
  if (!result.ok) process.exit(1);
}
