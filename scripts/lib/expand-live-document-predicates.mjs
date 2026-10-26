/**
 * Static guards read SQL as source text. Since FINAL-4 (#27770, verify-live-document-predicates-single-source) the void /
 * status exclusions are spelled through the canonical predicate module
 * (apps/backend/src/accounting/live-document-predicates.sql.ts) — `${notVoided()}`, `${liveInvoice("i")}`, … — so a guard
 * that greps for the literal `voided_at IS NULL` no longer sees a predicate that is still there.
 *
 * This expands each helper call into the exact SQL the REAL helper emits: the module is bundled with esbuild and executed,
 * nothing is re-typed here. A guard then asserts against the effective query, so deleting the helper call, or changing the
 * helper's body so it stops emitting the predicate, still fails the guard. Mirrors
 * apps/backend/src/reports/__tests__/expand-live-predicates.ts (the backend tests' expander).
 */
import { buildSync } from "esbuild";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const PREDICATES_MODULE = "apps/backend/src/accounting/live-document-predicates.sql.ts";

let cached = null;

/** Load the real predicate module (optionally from replacement source text, for selftests that plant a helper defect). */
export async function loadPredicates(overrideSource) {
  if (!overrideSource && cached) return cached;
  const entry = path.join(ROOT, PREDICATES_MODULE);
  const out = buildSync({
    ...(overrideSource
      ? { stdin: { contents: overrideSource, resolveDir: path.dirname(entry), sourcefile: entry, loader: "ts" } }
      : { entryPoints: [entry] }),
    bundle: true,
    format: "esm",
    platform: "node",
    write: false,
    logLevel: "silent",
  });
  const mod = await import(`data:text/javascript;base64,${Buffer.from(out.outputFiles[0].text).toString("base64")}`);
  if (!overrideSource) cached = mod;
  return mod;
}

const CALL = /(\$\{)?\b([a-zA-Z]+)\(\s*((?:"[A-Za-z_][A-Za-z0-9_]*"\s*,?\s*)*)\)(\})?/g;

/** Replace every `${helper("alias", …)}` / `helper()` call to an exported predicate with the SQL it returns. */
export async function expandLiveDocumentPredicates(src, overrideSource) {
  return expandWith(await loadPredicates(overrideSource), src);
}

/** Synchronous form for scanners that already hold the loaded module (`await loadPredicates()` once at the top). */
export function expandWith(mod, src) {
  return src.replace(CALL, (whole, _open, fn, rawArgs) => {
    if (typeof mod[fn] !== "function") return whole;
    const args = [...rawArgs.matchAll(/"([A-Za-z_][A-Za-z0-9_]*)"/g)].map((m) => m[1]);
    if (args.length === 0 && mod[fn].length > 0 && fn !== "notVoided" && fn !== "statusNotCancelled") return whole;
    try {
      return mod[fn](...args);
    } catch {
      return whole;
    }
  });
}
