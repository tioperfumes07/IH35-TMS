#!/usr/bin/env node
/**
 * UNIVERSAL MOUNT CHECK — every `*.routes.ts` is actually reachable, or it is a wiring bug.
 *
 * WHY THIS EXISTS. There are ~10 bespoke guards in this repo of the shape
 * `verify-<one-feature>-route-mounted.mjs` — cashflow, compliance, bulk-update, road-service,
 * driver-day-summary, relay-backfill, relay-csv-import, form425c-exhibits… Each was written after a
 * specific screen was found calling an endpoint that no server ever served. That is the per-site
 * one-off pattern: ten guards, ten features, and no answer for the eleventh. This asks the question
 * once, for every route file in the tree.
 *
 * THE TWO WAYS A ROUTE FILE GETS MOUNTED, and there are only two:
 *   1. AUTOLOAD — `@fastify/autoload` scans a directory for `*.routes.ts` and registers each file's
 *      DEFAULT export as a plugin. A file that sits in an autoloaded directory but exports no default
 *      is silently skipped: no error at boot, no route, and the screen that calls it gets a 404.
 *   2. EXPLICIT — its `register*Routes` function is invoked from somewhere that is itself reachable.
 *
 * WHY THE NAIVE CHECK IS WRONG, learned the hard way: grepping for "is `registerXRoutes` called
 * anywhere other than the file that defines it" reports 46 false positives here, because the
 * overwhelmingly common shape is a plugin wrapper IN THE SAME FILE:
 *      export default fp(async (app) => { await registerArAgingRoutes(app); }, { name: "…" });
 * The invocation lives exactly where the naive check excludes. Any mount check that does not
 * understand that shape will cry wolf on a third of the codebase.
 *
 * NOT CLAIMED: this proves a route file is REACHABLE, not that any particular path within it is
 * correct, guarded, or entity-scoped. It is the floor.
 *
 * Usage: node scripts/verify-route-file-mounted.mjs [--json out.json] [--selftest]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, dirname } from "node:path";
import { REFUSED_MOUNTS } from "./verify-route-manifest-parity.mjs";

const ROOT = process.cwd();
const SRC = join(ROOT, "apps/backend/src");
const LABEL = "verify-route-file-mounted";

function walk(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) {
      if (e === "node_modules" || e === "dist" || e === "__tests__") continue;
      walk(p, out);
    } else if (/\.routes\.ts$/.test(e) && !/\.(test|spec)\.ts$/.test(e)) out.push(p);
  }
  return out;
}

/** Directories whose `*.routes.ts` files are auto-registered by @fastify/autoload. */
export function autoloadedDirs(allFiles) {
  const dirs = new Set();
  for (const f of allFiles) {
    const src = readFileSync(f, "utf8");
    if (!src.includes("@fastify/autoload")) continue;
    // `dir: __dirname` is the shape used here; the autoloaded directory is the file's own directory.
    if (/dir:\s*__dirname/.test(src)) dirs.add(dirname(f));
  }
  return dirs;
}

export function hasDefaultPluginExport(src) {
  return /export\s+default\s+/.test(src);
}

/** The register* functions this file declares. */
export function registrarsIn(src) {
  return [...src.matchAll(/export\s+async\s+function\s+(register[A-Za-z0-9_]+)/g)].map((m) => m[1]);
}

if (process.argv.includes("--selftest")) {
  const cases = [
    ["same-file plugin wrapper counts as mounted", `export async function registerXRoutes(a){}\nexport default fp(async (app)=>{ await registerXRoutes(app); });`, true],
    ["no default export in an autoloaded dir is UNMOUNTED", `export async function registerXRoutes(a){}`, false],
  ];
  let bad = 0;
  for (const [name, src, expect] of cases) {
    const got = hasDefaultPluginExport(src);
    if (got !== expect) { bad++; console.error(`  selftest FAIL: ${name} — expected ${expect}, got ${got}`); }
  }
  if (registrarsIn("export async function registerAbcRoutes(a){}")[0] !== "registerAbcRoutes") {
    bad++; console.error("  selftest FAIL: registrarsIn did not find the declared registrar");
  }
  if (bad) { console.error(`${LABEL} --selftest: ${bad} case(s) failed`); process.exit(1); }
  console.log(`${LABEL} --selftest: ${cases.length + 1} cases pass`);
  process.exit(0);
}

const files = walk(SRC);
const indexFiles = [];
for (const d of new Set(files.map(dirname))) {
  const idx = join(d, "index.ts");
  try { statSync(idx); indexFiles.push(idx); } catch { /* no index in this dir */ }
}
const auto = autoloadedDirs([...files, ...indexFiles]);

// Everything reachable from anywhere: one pass over the whole backend, so a registrar invoked from a
// parent module or a barrel is seen.
const allSrc = new Map();
function walkAll(dir, out = []) {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    const st = statSync(p);
    if (st.isDirectory()) { if (e === "node_modules" || e === "dist") continue; walkAll(p, out); }
    else if (/\.ts$/.test(e)) out.push(p);
  }
  return out;
}
for (const f of walkAll(SRC)) allSrc.set(f, readFileSync(f, "utf8"));

/**
 * A module may be unmounted ON PURPOSE. `verify-route-manifest-parity` keeps that registry with a
 * written reason per file — some of them load-bearing: dispatch-view references a non-existent table
 * so mounting turns a 404 into a 500; scheduled-reports has a hard DELETE with no soft-delete column;
 * settlement-payment moves money. Re-deriving that judgement here would put two guards in conflict and
 * invite someone to "fix" a refusal that exists for a reason, so this guard READS that list rather than
 * owning a second copy. Meaning: unmounted AND not deliberately refused.
 */
const refused = new Set([...REFUSED_MOUNTS.keys()]);

const unmounted = [];
for (const f of files) {
  const rel = relative(ROOT, f);
  if ([...refused].some((r) => rel.endsWith(r))) continue;
  const src = allSrc.get(f) ?? readFileSync(f, "utf8");
  // @fastify/autoload scans RECURSIVELY, so a file in a SUBDIRECTORY of an autoloaded dir is in scope
  // too. Matching the directory exactly reported accounting/bank-recon/recon-worklist.routes.ts as
  // unreachable while the live API answered 401 on its path — mounted all along. Verified with the
  // discriminator every 404 claim needs: a definitely-nonexistent /api/v1 path returns 404, so a 401 is
  // proof of mounting, not of auth.
  const inAutoload = [...auto].some((d) => f === d || f.startsWith(`${d}/`));

  const regs = registrarsIn(src);

  // EXPLICIT mount, checked FIRST and for every file — including files that sit in an autoload
  // directory. The accounting autoloader deliberately IGNORES cash-flow / cash-forecast / finance-hub
  // because index.ts registers them by hand (comment 0441-mod10), so judging an autoload-dir file
  // purely on its default export reports three mounted screens as unreachable. Ask "is it mounted by
  // ANY route" before concluding it is mounted by none.
  const invokedElsewhere = regs.some((r) =>
    [...allSrc.entries()].some(([g, gsrc]) => g !== f && new RegExp(`\\b${r}\\s*\\(`).test(gsrc)),
  );
  const baseName = rel.split("/").pop().replace(/\.ts$/, "");
  const importedElsewhere = [...allSrc.entries()].some(
    ([g, gsrc]) => g !== f && gsrc.includes(`${baseName}.js`),
  );
  if (invokedElsewhere || importedElsewhere) continue;

  if (inAutoload) {
    if (hasDefaultPluginExport(src)) continue;
    unmounted.push({ file: rel, why: "sits in an @fastify/autoload directory, exports no default plugin, and nothing mounts it explicitly — autoload skips it silently" });
    continue;
  }
  if (regs.length === 0) continue; // nothing to mount (helpers, types)
  unmounted.push({ file: rel, why: `declares ${regs.join(", ")} but nothing outside this file invokes it and no other module imports it` });
}

const jsonIdx = process.argv.indexOf("--json");
if (jsonIdx !== -1) writeFileSync(process.argv[jsonIdx + 1], `${JSON.stringify({ scanned: files.length, autoloaded_dirs: [...auto].map((d) => relative(ROOT, d)), unmounted }, null, 2)}\n`);

if (unmounted.length) {
  console.error(`FAIL ${LABEL} — ${unmounted.length} route file(s) are not reachable; every path they declare is a 404:`);
  for (const u of unmounted) console.error(`  · ${u.file}\n      ${u.why}`);
  process.exit(1);
}
console.log(`${LABEL}: OK — all ${files.length} route file(s) are mounted (${auto.size} autoloaded dir(s)).`);
