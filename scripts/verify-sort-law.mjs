#!/usr/bin/env node
/**
 * GUARD: SORT LAW (owner ruling 2026-09-01, docs/bus/LAW-FIX-INSTANTLY-FULL-REGISTER-2026-09-01.md).
 *
 * "Every column in every list in every module sorts ascending then descending on click."
 *
 * Two distinct, previously-conflated defects, each checked here:
 *
 * SORT-01 — HIT-TARGET (fixed centrally, this guard pins the fix in place).
 *   ParityTable's sortable header button used to be `inline-flex items-center gap-1` — sized to
 *   its own label text, not the `<th>` it lives in. A click anywhere on the header's empty padding
 *   (which is most of a wide column) was a silent no-op. The fix is `w-full` on that button (plus
 *   a justify-* class mirroring the column's own text-right/text-center alignment, since a
 *   block-level w-full child no longer inherits the parent <th>'s text-align). One file, ~185
 *   ParityTable mounts fixed at once. This half of the guard just asserts the fix is still there —
 *   a regression here silently breaks sort clicks systemwide again.
 *
 * SORT-02 — SERVER-PAGE + INTERNAL-SORT CORRECTNESS BUG (ratchet, shrink-only).
 *   A page that (a) wires `onSortChange` (controlled sort key/direction) but (b) never sets
 *   `sortMode="external"` and (c) fetches through a paginated/limited API (evidence: `offset`,
 *   `has_more`, or a `.limit(` call in the same file) LOOKS sorted — the arrows toggle, the visible
 *   rows reorder — but only ever reorders the one fetched page. `?sort=`/`?dir=` never reaches the
 *   server, so a population larger than one page is not actually sorted at all. This is a
 *   correctness bug, not cosmetics — it is impossible for a user to tell it's happening.
 *   Fixing every instance requires real backend ORDER BY wiring per list (not a single central
 *   change); this guard tracks the remaining violation count as a SHRINK-ONLY baseline so the
 *   number can only go down, never grow back in, and asserts the flagship fix
 *   (InvoicesListPage.tsx, INVOICE_SORT_COLUMNS in invoices.routes.ts) is off the violation list.
 *
 * Usage:
 *   node scripts/verify-sort-law.mjs
 *   node scripts/verify-sort-law.mjs --selftest
 *   node scripts/verify-sort-law.mjs --write-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-sort-law";
const SELFTEST = process.argv.includes("--selftest");
const BASELINE_PATH = "scripts/sort-law-baseline.json";
const SCAN_DIR = "apps/frontend/src";
const PARITY_TABLE_PATH = "apps/frontend/src/components/parity/ParityTable.tsx";

/** SORT-01 — the sortable header button must fill the <th> (w-full), not just its own label. */
export function parityTableHitTargetOk(src) {
  const m = src.match(/column\.sortable \? \(\s*<button[\s\S]{0,1200}?onClick=\{\(\) => toggleSort\(key\)\}/);
  if (!m) return { ok: false, reason: "could not locate the sortable header <button> at all — structure changed" };
  const block = m[0];
  if (!/className=\{`[^`]*\bw-full\b/.test(block)) {
    return { ok: false, reason: "sortable header button lost `w-full` — header clicks regress to label-only hit target" };
  }
  return { ok: true };
}

/**
 * SORT-02 heuristic — a file is a violation when it:
 *   1. mounts ParityTable (`<ParityTable`)
 *   2. wires controlled sort (`onSortChange=`)
 *   3. does NOT declare `sortMode="external"`
 *   4. shows a server-pagination signal (`offset`, `has_more`, or `.limit(`) — i.e. the fetched
 *      rows are plausibly a slice, not the full population.
 * A file with no pagination signal is not flagged: an unpaged list's internal sort already covers
 * the full population, which is correct (not a violation of this specific defect class).
 */
export function isSortLawViolation(src) {
  if (!src.includes("<ParityTable")) return false;
  if (!src.includes("onSortChange=")) return false;
  if (src.includes('sortMode="external"')) return false;
  return /\boffset\b/.test(src) || /\bhas_more\b/.test(src) || /\.limit\(/.test(src);
}

function allSourceFiles() {
  const out = [];
  const abs = path.join(ROOT, SCAN_DIR);
  if (!fs.existsSync(abs)) return out;
  (function walk(dir) {
    for (const e of fs.readdirSync(dir)) {
      const p = path.join(dir, e);
      const st = fs.statSync(p);
      if (st.isDirectory()) {
        if (e !== "node_modules" && e !== "dist") walk(p);
      } else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e)) {
        out.push(path.relative(ROOT, p));
      }
    }
  })(abs);
  return out.sort();
}

if (SELFTEST) {
  const cases = [
    {
      name: "SORT-01 fixed shape passes",
      fn: () =>
        parityTableHitTargetOk(
          '{column.sortable ? (\n<button\ntype="button"\nclassName={`inline-flex w-full items-center gap-1 ${x}`}\nonClick={() => toggleSort(key)}\n>label</button>) : null}',
        ).ok === true,
    },
    {
      name: "SORT-01 label-only regression fails",
      fn: () =>
        parityTableHitTargetOk(
          '{column.sortable ? (\n<button\ntype="button"\nclassName="inline-flex items-center gap-1"\nonClick={() => toggleSort(key)}\n>label</button>) : null}',
        ).ok === false,
    },
    {
      name: "SORT-02: onSortChange + offset + no external = violation",
      fn: () =>
        isSortLawViolation(
          '<ParityTable onSortChange={onSortChange} />\nlistThing({ offset, limit })',
        ) === true,
    },
    {
      name: "SORT-02: sortMode=external clears the violation",
      fn: () =>
        isSortLawViolation(
          '<ParityTable onSortChange={onSortChange} sortMode="external" />\nlistThing({ offset, limit })',
        ) === false,
    },
    {
      name: "SORT-02: no pagination signal = not a violation of this class",
      fn: () => isSortLawViolation('<ParityTable onSortChange={onSortChange} />\nlistThing({})') === false,
    },
    {
      name: "SORT-02: no ParityTable mount at all = not applicable",
      fn: () => isSortLawViolation('listThing({ offset, limit })') === false,
    },
  ];
  let failed = false;
  for (const c of cases) {
    const ok = c.fn();
    console.log(`${ok ? "PASS" : "FAIL"} — ${c.name}`);
    if (!ok) failed = true;
  }
  if (failed) process.exit(1);
  console.log(`${LABEL} SELFTEST PASS — ${cases.length}/${cases.length} cases correct`);
  process.exit(0);
}

// --- SORT-01 (regression pin, not a ratchet — this must always hold) ---
const parityTableAbs = path.join(ROOT, PARITY_TABLE_PATH);
if (!fs.existsSync(parityTableAbs)) {
  console.error(`${LABEL} FAIL — ${PARITY_TABLE_PATH} not found; scan path is wrong.`);
  process.exit(1);
}
const sort01 = parityTableHitTargetOk(fs.readFileSync(parityTableAbs, "utf8"));
if (!sort01.ok) {
  console.error(`${LABEL} FAIL (SORT-01) — ${sort01.reason} (${PARITY_TABLE_PATH})`);
  process.exit(1);
}

// --- SORT-02 (shrink-only ratchet across all ParityTable mounts) ---
const files = allSourceFiles();
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO .tsx files under ${SCAN_DIR}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}
const violations = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (isSortLawViolation(src)) violations.push(rel);
}
violations.sort();

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(
    path.join(ROOT, BASELINE_PATH),
    JSON.stringify(
      {
        note:
          "SORT-02 — ParityTable mounts with controlled sort (onSortChange) but no sortMode=\"external\", " +
          "combined with a server-pagination signal (offset/has_more/.limit(). Each entry sorts only the " +
          "fetched page, not the true population, while looking sorted. An INVENTORY of remaining debt, " +
          "not an approval of it. May only SHRINK. Fix per file: wire the list's own API to accept " +
          "?sort=/?dir= with a column-name allowlist (never a raw client-supplied SQL identifier, see " +
          "INVOICE_SORT_COLUMNS in apps/backend/src/accounting/invoices.routes.ts for the pattern), pass " +
          "them through, then add sortMode=\"external\" to the ParityTable mount.",
        files_scanned: files.length,
        offenders: violations,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${LABEL}: baseline written — ${violations.length} SORT-02 offender(s) across ${files.length} file(s).`);
  process.exit(0);
}

const baselineAbs = path.join(ROOT, BASELINE_PATH);
if (!fs.existsSync(baselineAbs)) {
  console.log(`${LABEL}: SORT-01 OK. SORT-02: no baseline yet; ${violations.length} offender(s) across ${files.length} file(s).`);
  process.exit(0);
}
const baseline = new Set(JSON.parse(fs.readFileSync(baselineAbs, "utf8")).offenders ?? []);
const added = violations.filter((v) => !baseline.has(v));
if (added.length || violations.length > baseline.size) {
  console.error(`${LABEL} FAIL (SORT-02) — NEW server-page + internal-sort violation(s):\n`);
  for (const a of added.slice(0, 20)) console.error(`  - ${a}`);
  if (violations.length > baseline.size) {
    console.error(`\n  offender count rose ${baseline.size} -> ${violations.length}. The baseline may only SHRINK.`);
  }
  process.exit(1);
}

console.log(
  `${LABEL}: OK — SORT-01 hit-target fix in place; SORT-02 ratchet holding at ${violations.length}/${baseline.size} across ${files.length} file(s).`,
);
process.exit(0);
