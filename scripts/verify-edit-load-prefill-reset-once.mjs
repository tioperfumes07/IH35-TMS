#!/usr/bin/env node
/**
 * WIZ-48 — EDIT LOAD PREFILL MUST BE APPLIED ONCE (anti silent-data-loss on save).
 *
 * THE DEFECT THIS GUARD PINS
 * --------------------------
 * Edit Load opens BookLoadModalV4 pre-filled by loading the persisted load and calling
 *   form.reset({ ...form.getValues(), ...buildEditPrefill(editLoad) })
 * so the persisted values become the clean (nothing-dirty) baseline; the Save body is
 * dirtyFields-gated, so only fields the operator then changes are PATCHed.
 *
 * `editLoadQuery` uses staleTime:0 and therefore refetches (window focus / mount / reconnect). If
 * that reset runs on EVERY refetch — i.e. the effect is keyed on the `editLoad` object with no
 * applied-once guard — a refetch OVERWRITES the operator's in-progress edits AND clears their
 * dirtyFields. A field the operator changed BEFORE the refetch is then silently dropped from the
 * PATCH, while a field changed AFTER it survives. On load 13508 the truck (changed first) was lost
 * and the driver (changed later) persisted, yet the toast said "saved". A save that reports success
 * while dropping a field the operator changed is the worst defect class in the product.
 *
 * WHAT IT ASSERTS
 * ---------------
 * Every `form.reset(...)` whose argument reaches `buildEditPrefill(` must sit inside a useEffect that
 * FIRST guards with an applied-once check — `shouldApplyEditPrefill(` followed by an early `return` —
 * so a refetch cannot re-run the reset and clobber edits. An unguarded prefill reset FAILS the build.
 *
 *   node scripts/verify-edit-load-prefill-reset-once.mjs
 *   node scripts/verify-edit-load-prefill-reset-once.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-edit-load-prefill-reset-once";
const TARGET = "apps/frontend/src/pages/dispatch/components/BookLoadModalV4.tsx";

/** Blank // and block comments, preserving byte offsets so slices/line numbers stay exact. */
export function blankComments(source) {
  let out = "";
  let i = 0;
  let str = null;
  while (i < source.length) {
    const c = source[i];
    const next = source[i + 1];
    if (str) {
      out += c;
      if (c === "\\") { out += next ?? ""; i += 2; continue; }
      if (c === str) str = null;
      i += 1;
      continue;
    }
    if (c === '"' || c === "'" || c === "`") { str = c; out += c; i += 1; continue; }
    if (c === "/" && next === "/") { while (i < source.length && source[i] !== "\n") { out += " "; i += 1; } continue; }
    if (c === "/" && next === "*") {
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) { out += source[i] === "\n" ? "\n" : " "; i += 1; }
      out += "  "; i += 2; continue;
    }
    out += c;
    i += 1;
  }
  return out;
}

/** Slice from `start` (an opening bracket) through its balanced close, quote-aware. */
export function sliceBalanced(src, start, open, close) {
  let depth = 0;
  let str = null;
  for (let i = start; i < src.length; i++) {
    const c = src[i];
    if (str) { if (c === "\\") { i += 1; continue; } if (c === str) str = null; continue; }
    if (c === '"' || c === "'" || c === "`") { str = c; continue; }
    if (c === open) depth += 1;
    else if (c === close) { depth -= 1; if (depth === 0) return src.slice(start, i + 1); }
  }
  return src.slice(start);
}

const lineOf = (src, index) => src.slice(0, index).split("\n").length;

/**
 * Return the body of the useEffect that encloses `index`, or null. Walks backwards to the nearest
 * `useEffect(() => {` and returns its balanced `{ … }` body IF it contains `index`.
 */
export function enclosingEffectBody(src, index) {
  const re = /useEffect\s*\(\s*\(\s*\)\s*=>\s*\{/g;
  let best = null;
  for (const m of src.matchAll(re)) {
    if (m.index > index) break;
    const braceStart = src.indexOf("{", m.index + m[0].length - 1);
    if (braceStart < 0) continue;
    const body = sliceBalanced(src, braceStart, "{", "}");
    if (m.index + m[0].length - 1 <= index && index <= braceStart + body.length) {
      best = { start: braceStart, body };
    }
  }
  return best;
}

/**
 * Findings: every prefill reset that is NOT guarded applied-once. `src` is comment-blanked source.
 */
export function findUnguardedPrefillResets(rel, src) {
  const problems = [];
  let prefillResets = 0;
  for (const m of src.matchAll(/\bform\s*\.\s*reset\s*\(/g)) {
    const argOpen = src.indexOf("(", m.index + m[0].length - 1);
    const args = sliceBalanced(src, argOpen, "(", ")");
    if (!args.includes("buildEditPrefill(")) continue; // only the EDIT prefill reset
    prefillResets += 1;
    const effect = enclosingEffectBody(src, m.index);
    const where = `${rel}:${lineOf(src, m.index)}`;
    if (!effect) {
      problems.push(`${where}  buildEditPrefill reset is not inside a useEffect — cannot prove it is applied once.`);
      continue;
    }
    const beforeReset = effect.body.slice(0, m.index - effect.start);
    const guarded = /shouldApplyEditPrefill\s*\(/.test(beforeReset) && /\breturn\b/.test(beforeReset);
    if (!guarded) {
      problems.push(
        `${where}  buildEditPrefill reset runs on every editLoad change (staleTime:0 refetch) — ` +
          `it must be guarded applied-once (shouldApplyEditPrefill(...) + early return) so a refetch ` +
          `cannot clobber the operator's in-progress edits and silently drop them from the PATCH.`
      );
    }
  }
  return { problems, prefillResets };
}

function selftest() {
  const failures = [];
  const bad = blankComments(`
useEffect(() => {
  if (!open || !isEditMode || !editLoad) return;
  form.reset({ ...form.getValues(), ...(buildEditPrefill(editLoad)) });
}, [open, isEditMode, editLoad]);
`);
  const badRes = findUnguardedPrefillResets("bad.tsx", bad);
  if (badRes.prefillResets !== 1) failures.push("selftest: bad snippet must contain exactly one prefill reset");
  if (badRes.problems.length !== 1) failures.push("selftest: an UNGUARDED prefill reset must be flagged");

  const good = blankComments(`
useEffect(() => {
  if (!open || !isEditMode || !editLoad) return;
  if (!shouldApplyEditPrefill(editPrefillAppliedRef.current, editLoadId)) return;
  editPrefillAppliedRef.current = editLoadId ?? null;
  form.reset({ ...form.getValues(), ...(buildEditPrefill(editLoad)) });
}, [open, isEditMode, editLoad, editLoadId]);
`);
  const goodRes = findUnguardedPrefillResets("good.tsx", good);
  if (goodRes.prefillResets !== 1) failures.push("selftest: good snippet must contain exactly one prefill reset");
  if (goodRes.problems.length !== 0) failures.push(`selftest: a GUARDED prefill reset must pass, got: ${goodRes.problems.join(" | ")}`);

  // A non-prefill form.reset() (close handler) must be ignored entirely.
  const closeReset = blankComments(`useEffect(() => { form.reset(); }, [open]);`);
  const closeRes = findUnguardedPrefillResets("close.tsx", closeReset);
  if (closeRes.prefillResets !== 0 || closeRes.problems.length !== 0) {
    failures.push("selftest: a plain form.reset() that does not prefill must be ignored");
  }

  if (failures.length > 0) {
    console.error(`[${LABEL}] SELFTEST FAILED (${failures.length})`);
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log(`[${LABEL}] selftest OK — unguarded reset flagged, guarded reset passes, close reset ignored.`);
  return 0;
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();
  const abs = path.join(ROOT, TARGET);
  if (!fs.existsSync(abs)) {
    console.error(`[${LABEL}] FAIL — target not found: ${TARGET}`);
    return 1;
  }
  const src = blankComments(fs.readFileSync(abs, "utf8"));
  const { problems, prefillResets } = findUnguardedPrefillResets(TARGET, src);
  console.log(`[${LABEL}] scanned ${TARGET}; ${prefillResets} buildEditPrefill reset(s).`);
  if (prefillResets === 0) {
    console.error(`[${LABEL}] FAIL — expected the Edit prefill reset in ${path.basename(TARGET)}; found none (moved/renamed?).`);
    return 1;
  }
  if (problems.length > 0) {
    console.error(`[${LABEL}] FAIL — ${problems.length} unguarded prefill reset(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return 1;
  }
  console.log(`[${LABEL}] PASS — the Edit prefill reset is applied once; a refetch cannot clobber in-progress edits.`);
  return 0;
}

process.exitCode = main();
