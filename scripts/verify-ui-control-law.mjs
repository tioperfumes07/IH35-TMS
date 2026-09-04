#!/usr/bin/env node
/**
 * GUARD: UI CONTROL LAW (owner ruling 2026-09-01, docs/bus/UI-CONTROL-LAW-SPEC-2026-09-01.md;
 * button height corrected again 2026-09-04, CLICKABLE-BOX-SIZE LAW, ORCH-measured — the two-tier
 * md=h-9/icon-sm=h-8 scale below collapsed onto one clickable-box target, h-7 (28px), for both).
 *
 * Owner-observed, live: Create/Go to Vendors/Create in the accounting toolbar rendered at three
 * different box sizes and three different text sizes; Void/Clear/Export in a bulk-action bar
 * weren't the same text size as each other; row/select-all checkboxes were too small to hit
 * reliably; the gear icon was smaller than its neighbours; filter controls were out of proportion
 * with the toolbar around them (that last item — FILTER LAW — already shipped separately).
 *
 * Root cause (grounded in the actual code, not guessed): a real button-scale primitive
 * (components/Button.tsx) already existed but wasn't universally consumed — ParityTable's own
 * Export/gear toolbar hand-rolled a THIRD, ad-hoc size instead of calling it, and Button.tsx's
 * own "md" size differed between variants (h-8 primary/danger vs h-7 secondary/tertiary) before
 * this fix. The two selection checkboxes were bare `<input type="checkbox">` with zero sizing at
 * all -- no hit-target treatment, visual or clickable.
 *
 * Fix, checked here:
 * 1. Button.tsx's "md" size is ONE height (BUTTON_MD_SIZE_CLASS) for every variant, matching
 *    FILTER_CONTROL_SIZE_CLASS (a button and a filter in the same toolbar row are the same
 *    height) -- hard regression pin.
 * 2. Button.tsx's "icon"/"sm" size uses BUTTON_ICON_SM_SIZE_CLASS (h-8, raised from h-6, which
 *    sat exactly on the WCAG 2.2 SC 2.5.8 24x24 floor with zero margin) -- hard regression pin.
 * 3. ParityTable's row and select-all checkboxes are each wrapped in MIN_HIT_TARGET_CLASS (a
 *    >=24x24 clickable wrapper around the native, still-small visual checkbox) -- hard
 *    regression pin.
 * 4. ParityTable's Export/gear toolbar controls render through the real <Button> component, and
 *    the gear uses a real icon (TOOLBAR_ICON_SIZE_CLASS) instead of a bare Unicode glyph -- hard
 *    regression pin.
 * 5. A shrink-only ratchet across the rest of the app for a bare `<button ...>` combining a
 *    literal height + padding + font-size (the exact ad-hoc-third-size shape that caused the
 *    owner's original report) outside Button.tsx itself -- an inventory of remaining
 *    not-yet-swept pages, not an approval of them.
 *
 * Usage:
 *   node scripts/verify-ui-control-law.mjs
 *   node scripts/verify-ui-control-law.mjs --selftest
 *   node scripts/verify-ui-control-law.mjs --write-baseline
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-ui-control-law";
const SELFTEST = process.argv.includes("--selftest");
const BASELINE_PATH = "scripts/ui-control-law-baseline.json";
const SCAN_DIR = "apps/frontend/src";
const TOKENS_PATH = "apps/frontend/src/design/tokens.ts";
const BUTTON_PATH = "apps/frontend/src/components/Button.tsx";
const PARITY_TABLE_PATH = "apps/frontend/src/components/parity/ParityTable.tsx";

export function tokensExportButtonScale(src) {
  // CLICKABLE-BOX-SIZE LAW (owner ruling 2026-09-04, ORCH-measured) collapsed the 2026-09-01
  // md=h-9/icon-sm=h-8 two-tier scale onto one clickable-box target, h-7 (28px) for both --
  // updated here in the same pass that changed tokens.ts, not a separate follow-up.
  return (
    /export const BUTTON_MD_SIZE_CLASS\s*=\s*"[^"]*h-7[^"]*"/.test(src) &&
    /export const BUTTON_ICON_SM_SIZE_CLASS\s*=\s*"[^"]*h-7[^"]*"/.test(src) &&
    /export const TOOLBAR_ICON_SIZE_CLASS\s*=\s*"[^"]*h-4[^"]*w-4[^"]*"/.test(src) &&
    /export const MIN_HIT_TARGET_CLASS\s*=\s*"[^"]*min-h-6[^"]*min-w-6[^"]*"/.test(src)
  );
}

export function buttonUsesSharedScale(src) {
  return src.includes("BUTTON_MD_SIZE_CLASS") && src.includes("BUTTON_ICON_SM_SIZE_CLASS");
}

export function parityTableCheckboxesWrapped(src) {
  const rowCheckbox = src.match(/aria-label="Select row"[\s\S]{0,200}/);
  const allCheckbox = src.match(/aria-label="Select all on page"[\s\S]{0,200}/);
  if (!rowCheckbox || !allCheckbox) return { ok: false, reason: "could not locate one or both checkboxes at all" };
  // The checkbox must sit inside a MIN_HIT_TARGET_CLASS wrapper -- look BACKWARD from the
  // aria-label match for the wrapping <span className={MIN_HIT_TARGET_CLASS}>.
  const before = (marker) => src.slice(Math.max(0, src.indexOf(marker) - 200), src.indexOf(marker));
  const rowWrapped = before('aria-label="Select row"').includes("MIN_HIT_TARGET_CLASS");
  const allWrapped = before('aria-label="Select all on page"').includes("MIN_HIT_TARGET_CLASS");
  if (!rowWrapped || !allWrapped) {
    return { ok: false, reason: `row checkbox wrapped=${rowWrapped}, select-all wrapped=${allWrapped}` };
  }
  return { ok: true };
}

export function parityTableExportGearUseButton(src) {
  const hasStrayAdHocSize = /min-h-11[\s\S]{0,60}text-\[12px\]/.test(src);
  // Same [^>]* attribute-order fragility as fileHasAdHocButtonSize above -- tolerate `=>` so an
  // onClick prop ahead of aria-label (a legal, common JSX ordering) doesn't break detection.
  const usesButtonForExport = /<Button(?:[^>]|=>)*aria-label="Export CSV"/.test(src);
  const usesButtonForGear = /<Button[\s\S]{0,200}aria-label="Table settings"/.test(src);
  const gearUsesIcon = /GearIcon[\s\S]{0,40}TOOLBAR_ICON_SIZE_CLASS/.test(src);
  if (hasStrayAdHocSize) return { ok: false, reason: "min-h-11/text-[12px] ad-hoc button size reintroduced" };
  if (!usesButtonForExport) return { ok: false, reason: "Export control is not a <Button>" };
  if (!usesButtonForGear) return { ok: false, reason: "gear control is not a <Button>" };
  if (!gearUsesIcon) return { ok: false, reason: "gear is not rendering a real icon at TOOLBAR_ICON_SIZE_CLASS" };
  return { ok: true };
}

/**
 * Shrink-only ratchet: a bare `<button ...>` (not `<Button`) combining a literal height class
 * (h-N or min-h-N) with a literal font-size (text-[Npx]) is the exact "third ad-hoc size" shape
 * that caused the owner's original report. Button.tsx itself is excluded (it's the primitive).
 *
 * CTL-01-COLLAPSED-LIST-FILTERS-GAP: `[^>]*` between the tag open and `className=` silently
 * stops at the FIRST literal `>` it meets -- including the one inside an inline arrow-function
 * prop like `onClick={() => ...}`, which sits ahead of className in plenty of real components
 * (CollapsedListFilters.tsx's own "Filters" toggle did exactly this). That let a real, live
 * ad-hoc h-8/text-[12px] button slip past this ratchet with a false "0 offenders" baseline.
 * `(?:[^>]|=>)*` tolerates a literal `=>` as a unit while still stopping at the tag's real close.
 *
 * Height is bounded to h-6..h-9 (Button.tsx's own actual scale: icon/sm=h-8, md=h-9) on purpose --
 * a large dashboard/KPI-tile button (e.g. BankingHome's h-16 nav cards) is a legitimately
 * different, out-of-law UI pattern, not the toolbar "third ad-hoc size" this guard targets;
 * matching bare h-\d would false-flag every one of those as a regression.
 */
export function fileHasAdHocButtonSize(src) {
  // Case-sensitive: <button (the raw HTML tag) never matches <Button (the shared component).
  const tagRe = /<button\b(?:[^>]|=>)*className=(\{`[^`]*`\}|"[^"]*")/g;
  let m;
  while ((m = tagRe.exec(src))) {
    const classBlob = m[1];
    if (/\b(?:min-)?h-[6-9]\b/.test(classBlob) && /text-\[\d+px\]/.test(classBlob)) return true;
  }
  return false;
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
      } else if (/\.tsx$/.test(e) && !/\.test\.tsx$/.test(e) && p !== path.join(ROOT, BUTTON_PATH)) {
        out.push(path.relative(ROOT, p));
      }
    }
  })(abs);
  return out.sort();
}

if (SELFTEST) {
  const cases = [
    {
      name: "tokens.ts exporting the real scale constants passes",
      fn: () =>
        tokensExportButtonScale(
          'export const BUTTON_MD_SIZE_CLASS = "h-7 px-2 text-[13px] font-medium";\n' +
            'export const BUTTON_ICON_SM_SIZE_CLASS = "h-7 text-[13px] font-medium";\n' +
            'export const TOOLBAR_ICON_SIZE_CLASS = "h-4 w-4";\n' +
            'export const MIN_HIT_TARGET_CLASS = "flex min-h-6 min-w-6 items-center justify-center";',
        ) === true,
    },
    {
      name: "tokens.ts with a downgraded icon size fails",
      fn: () =>
        tokensExportButtonScale(
          'export const BUTTON_MD_SIZE_CLASS = "h-7 px-2 text-[13px] font-medium";\n' +
            'export const BUTTON_ICON_SM_SIZE_CLASS = "h-6 text-[13px] font-medium";\n' +
            'export const TOOLBAR_ICON_SIZE_CLASS = "h-4 w-4";\n' +
            'export const MIN_HIT_TARGET_CLASS = "flex min-h-6 min-w-6 items-center justify-center";',
        ) === false,
    },
    {
      name: "Button.tsx referencing the shared constants passes",
      fn: () => buttonUsesSharedScale("return BUTTON_MD_SIZE_CLASS; // ... BUTTON_ICON_SM_SIZE_CLASS") === true,
    },
    {
      name: "Button.tsx with hand-rolled sizes (no shared constants) fails",
      fn: () => buttonUsesSharedScale('return "h-8 px-3 text-[13px]";') === false,
    },
    {
      name: "wrapped checkboxes pass",
      fn: () =>
        parityTableCheckboxesWrapped(
          '<span className={MIN_HIT_TARGET_CLASS}><input aria-label="Select row" /></span>' +
            '<span className={MIN_HIT_TARGET_CLASS}><input aria-label="Select all on page" /></span>',
        ).ok === true,
    },
    {
      name: "an unwrapped checkbox fails",
      fn: () =>
        parityTableCheckboxesWrapped(
          '<input aria-label="Select row" />' +
            '<span className={MIN_HIT_TARGET_CLASS}><input aria-label="Select all on page" /></span>',
        ).ok === false,
    },
    {
      name: "Export/gear as real Button with icon passes",
      fn: () =>
        parityTableExportGearUseButton(
          '<Button aria-label="Export CSV">Export</Button>' +
            '<Button aria-label="Table settings"><GearIcon className={TOOLBAR_ICON_SIZE_CLASS} /></Button>',
        ).ok === true,
    },
    {
      name: "reintroduced ad-hoc min-h-11/text-[12px] button fails",
      fn: () =>
        parityTableExportGearUseButton(
          '<button className="min-h-11 text-[12px]" aria-label="Export CSV">Export</button>' +
            '<Button aria-label="Table settings"><GearIcon className={TOOLBAR_ICON_SIZE_CLASS} /></Button>',
        ).ok === false,
    },
    {
      name: "a bare <button> combining literal height+font-size is flagged",
      fn: () => fileHasAdHocButtonSize('<button className="h-8 px-3 text-[12px]">Go</button>') === true,
    },
    {
      name: "a <Button> component call is not flagged as a bare button",
      fn: () => fileHasAdHocButtonSize('<Button className="h-8 text-[12px]">Go</Button>') === false,
    },
    {
      // CTL-01-COLLAPSED-LIST-FILTERS-GAP regression: an inline arrow-function prop (onClick)
      // ahead of className used to make [^>]* stop at the `>` inside `=>`, hiding this exact,
      // real, live shape (CollapsedListFilters.tsx's un-fixed "Filters" toggle) from the ratchet.
      name: "an onClick={() => ...} prop AHEAD of className does not hide a bare ad-hoc button",
      fn: () =>
        fileHasAdHocButtonSize(
          '<button type="button" onClick={() => setOpen((o) => !o)} className="h-8 px-2 text-[12px]">Filters</button>',
        ) === true,
    },
    {
      // A large dashboard/KPI-tile button (BankingHome's h-16 nav cards) is a legitimately
      // different UI pattern, not the toolbar "third ad-hoc size" -- must NOT be flagged.
      name: "a large h-16 dashboard tile button is not a toolbar ad-hoc-size violation",
      fn: () =>
        fileHasAdHocButtonSize(
          '<button type="button" onClick={() => navigate("/x")} className="flex h-16 flex-col text-[12px]">Tile</button>',
        ) === false,
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

let failed = false;

const tokensAbs = path.join(ROOT, TOKENS_PATH);
if (!fs.existsSync(tokensAbs) || !tokensExportButtonScale(fs.readFileSync(tokensAbs, "utf8"))) {
  console.error(`${LABEL} FAIL — ${TOKENS_PATH} no longer exports the full UI CONTROL LAW scale (BUTTON_MD_SIZE_CLASS/BUTTON_ICON_SM_SIZE_CLASS/TOOLBAR_ICON_SIZE_CLASS/MIN_HIT_TARGET_CLASS).`);
  failed = true;
}

const buttonAbs = path.join(ROOT, BUTTON_PATH);
if (!fs.existsSync(buttonAbs) || !buttonUsesSharedScale(fs.readFileSync(buttonAbs, "utf8"))) {
  console.error(`${LABEL} FAIL — ${BUTTON_PATH} no longer references the shared button-scale constants.`);
  failed = true;
}

const parityAbs = path.join(ROOT, PARITY_TABLE_PATH);
if (!fs.existsSync(parityAbs)) {
  console.error(`${LABEL} FAIL — ${PARITY_TABLE_PATH} not found; scan path is wrong.`);
  failed = true;
} else {
  const paritySrc = fs.readFileSync(parityAbs, "utf8");
  const checkboxCheck = parityTableCheckboxesWrapped(paritySrc);
  if (!checkboxCheck.ok) {
    console.error(`${LABEL} FAIL (checkboxes) — ${checkboxCheck.reason}`);
    failed = true;
  }
  const buttonCheck = parityTableExportGearUseButton(paritySrc);
  if (!buttonCheck.ok) {
    console.error(`${LABEL} FAIL (export/gear) — ${buttonCheck.reason}`);
    failed = true;
  }
}

// --- shrink-only ratchet across the rest of the app ---
const files = allSourceFiles();
if (files.length === 0) {
  console.error(`${LABEL} FAIL — scanned ZERO .tsx files under ${SCAN_DIR}; scope is wrong, refusing to pass vacuously.`);
  process.exit(1);
}
const violations = [];
for (const rel of files) {
  const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
  if (fileHasAdHocButtonSize(src)) violations.push(rel);
}
violations.sort();

if (process.argv.includes("--write-baseline")) {
  fs.writeFileSync(
    path.join(ROOT, BASELINE_PATH),
    JSON.stringify(
      {
        note:
          "UI CONTROL LAW — bare <button> elements (not the shared Button.tsx primitive) combining " +
          "a literal height class with a literal font-size class: the exact ad-hoc third-button-size " +
          "shape the owner reported live. An INVENTORY of remaining debt, not an approval of it. May " +
          "only SHRINK. Fix per file: replace with <Button size=\"md\"|\"sm\"|\"icon\" variant=\"...\">.",
        files_scanned: files.length,
        offenders: violations,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`${LABEL}: baseline written — ${violations.length} ad-hoc button offender(s) across ${files.length} file(s).`);
  process.exit(failed ? 1 : 0);
}

const baselineAbs = path.join(ROOT, BASELINE_PATH);
if (!fs.existsSync(baselineAbs)) {
  console.log(`${LABEL}: no ratchet baseline yet; ${violations.length} ad-hoc button offender(s) across ${files.length} file(s).`);
  if (failed) process.exit(1);
  process.exit(0);
}
const baseline = new Set(JSON.parse(fs.readFileSync(baselineAbs, "utf8")).offenders ?? []);
const added = violations.filter((v) => !baseline.has(v));
if (added.length || violations.length > baseline.size) {
  console.error(`${LABEL} FAIL (ad-hoc button ratchet) — NEW offender(s):\n`);
  for (const a of added.slice(0, 20)) console.error(`  - ${a}`);
  if (violations.length > baseline.size) {
    console.error(`\n  offender count rose ${baseline.size} -> ${violations.length}. The baseline may only SHRINK.`);
  }
  failed = true;
}

if (failed) process.exit(1);
console.log(
  `${LABEL}: OK — button scale, checkbox hit targets, and ParityTable Export/gear all pinned; ad-hoc button ratchet holding at ${violations.length}/${baseline.size} across ${files.length} file(s).`,
);
process.exit(0);
