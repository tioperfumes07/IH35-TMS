#!/usr/bin/env node
/**
 * verify-one-control-height — step 18125 (lead, 2026-10-04).
 *
 * OWNER DESIGN LAW 2026-10-02 rule 2, re-reported 2026-10-04 (verbatim): "ALL BOXES, DATES,
 * FILTERS ETC MUST BE UNIFORM FOLLOWING STANDARD DESIGN HEIGHTS ETC."
 *
 * ROOT CAUSE of the class: a shared filter-control component sizes its TRIGGER with vertical
 * PADDING (`py-1`) instead of declaring a HEIGHT. Padding plus an icon glyph of a different size
 * yields a different rendered height per component, so controls in the same toolbar row sit a few
 * pixels apart. MEASURED: MultiSelectDropdown's trigger carried no height class at all,
 * misaligning all 27 of its call sites against every Combobox / date / search control beside it.
 *
 * TWO CRY-WOLF CLASSES WERE MEASURED AND EXCLUDED BY CONSTRUCTION, because a guard that cries wolf
 * is worse than no guard:
 *
 *   1. FILE SCOPE IS WRONG. A first cut asked whether the FILE contained any `h-*` class.
 *      MultiSelectDropdown on main passed that check on its ChevronDown icon's `h-3.5` while its
 *      trigger carried no height at all — a false green, which is the one thing worse than a false
 *      red. The height must be declared on the trigger's own className string.
 *
 *   2. NOT EVERY BORDERED BOX IS A TRIGGER. Scoping by "bordered + horizontally padded" flagged 3
 *      controls, all 3 correct: Combobox's option rows, MultiSelectDropdown's in-panel search
 *      input, and DatePicker's `dp-select` month/year pickers inside the calendar popover. Those
 *      are in-panel sub-controls, not toolbar controls, and padding sizing is right for them. The
 *      TRIGGER is the element that opens the control, and it is the element carrying
 *      `aria-expanded` / `aria-haspopup`. That marker is this guard's discriminator.
 *
 * A control satisfies the law when every trigger surface declares its height via:
 *   (a) FILTER_CONTROL_SIZE_CLASS — the one token; or
 *   (b) an interpolated size/height identifier (`${controlSizeClass}`), the house pattern for a
 *       control that computes its height class from a `size` prop; or
 *   (c) an explicit `h-*` on that same string; or
 *   (d) the component delegates sizing wholesale to an inner shared control via `size=`.
 * `py-*` alone is the defect.
 *
 * Adding a new shared filter control requires adding it to SHARED_FILTER_CONTROLS. That is the
 * ratchet — the whitelist is explicit and auditable rather than a heuristic over the whole app.
 *
 * Usage:
 *   node scripts/verify-one-control-height.mjs
 *   node scripts/verify-one-control-height.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();

/** The shared controls that render into a filter/toolbar row and therefore owe the house height. */
export const SHARED_FILTER_CONTROLS = [
  "apps/frontend/src/components/Combobox.tsx",
  "apps/frontend/src/components/forms/MultiSelectDropdown.tsx",
  "apps/frontend/src/components/forms/DatePicker.tsx",
  "apps/frontend/src/components/forms/StateSelect.tsx",
  "apps/frontend/src/components/forms/QboCombobox.tsx",
  "apps/frontend/src/components/table/TableSearch.tsx",
];

export const TOKEN = "FILTER_CONTROL_SIZE_CLASS";

const DELEGATES_SIZE_RE = /<\s*(?:Combobox|DatePicker|MultiSelectDropdown|TableSearch)\b[^>]*\bsize\s*=/s;
const SURFACE_RE = /\bborder\b/;
const PADDED_RE = /\bpx-\d|\bpx-\[/;
const OWN_HEIGHT_RE = /\bh-\d|\bh-\[|\bh-full\b/;
const INTERPOLATED_HEIGHT_RE = /\$\{[^}]*(?:size|height)[^}]*\}/i;
const TRIGGER_MARKER_RE = /aria-(?:expanded|haspopup)/;
const TRIGGER_WINDOW = 600;

/** Every long string / template literal, with its offset, so a surface can be located in its JSX. */
export function extractClassStrings(source) {
  const out = [];
  const re = /(?:"([^"\n]{8,400})"|'([^'\n]{8,400})'|`([^`]{8,400})`)/g;
  let m;
  while ((m = re.exec(source)) !== null) {
    const v = m[1] ?? m[2] ?? m[3];
    if (v) out.push({ text: v, index: m.index });
  }
  return out;
}

/** Bordered + horizontally padded, inside an element carrying a trigger marker. */
export function controlSurfaces(source) {
  return extractClassStrings(source).filter(({ text, index }) => {
    if (!SURFACE_RE.test(text) || !PADDED_RE.test(text)) return false;
    const win = source.slice(Math.max(0, index - TRIGGER_WINDOW), index + text.length + TRIGGER_WINDOW);
    return TRIGGER_MARKER_RE.test(win);
  });
}

export function declaresHeight(surface) {
  return surface.includes(TOKEN) || OWN_HEIGHT_RE.test(surface) || INTERPOLATED_HEIGHT_RE.test(surface);
}

export function classifyControl(source) {
  if (DELEGATES_SIZE_RE.test(source)) return { ok: true, how: "delegates-size", offenders: [] };
  const surfaces = controlSurfaces(source).map((s) => s.text);
  if (surfaces.length === 0) return { ok: true, how: "no-trigger-surface", offenders: [] };
  const offenders = surfaces.filter((s) => !declaresHeight(s));
  if (offenders.length) return { ok: false, how: `${offenders.length} unsized trigger(s)`, offenders };
  const how = surfaces.some((s) => s.includes(TOKEN))
    ? "token"
    : surfaces.some((s) => INTERPOLATED_HEIGHT_RE.test(s))
      ? "interpolated-size"
      : "own-height";
  return { ok: true, how, offenders: [] };
}

function selftest() {
  const cases = [];
  const ok = (name, cond) => cases.push({ name, pass: !!cond });
  const trig = (cls) => `<button aria-expanded={open} className={\`${cls}\`}>x</button>`;

  ok("1 a trigger taking the token satisfies the law", classifyControl(trig("flex border border-gray-300 px-2 ${" + TOKEN + "}")).how === "token");
  ok("2 delegating size to an inner Combobox satisfies the law", classifyControl("return <Combobox size={size} options={o} />;").how === "delegates-size");
  ok("3 an explicit h-8 on the trigger satisfies the law", classifyControl(trig("h-8 border border-gray-300 px-2")).how === "own-height");
  ok("4 py-1 with no height on the trigger IS the defect", classifyControl(trig("flex border border-gray-300 px-2 py-1 text-xs")).ok === false);
  ok(
    "5 REGRESSION (false green): an icon h-3.5 elsewhere in the file must NOT excuse an unsized trigger",
    classifyControl(trig("flex border border-gray-300 px-2 py-1 text-xs") + ' const i = <Chevron className="h-3.5 w-3.5" />;').ok === false,
  );
  ok(
    "6 CRY-WOLF: an in-panel padded select with no trigger marker nearby is NOT flagged",
    classifyControl('<select className="dp-select w-16 rounded-sm border border-gray-200 px-1 py-0.5 text-xs" />').how === "no-trigger-surface",
  );
  ok("7 CRY-WOLF: an interpolated ${controlSizeClass} IS a height source", declaresHeight("rounded border bg-white px-2 ${controlSizeClass}"));
  ok("8 a Combobox rendered WITHOUT a size prop is not delegation", classifyControl("return <Combobox options={o} />;").how !== "delegates-size");
  ok("9 the token is recognised inside a template literal", declaresHeight("flex border px-2 ${" + TOKEN + "}"));
  ok("10 every whitelisted control path exists on disk (the whitelist cannot rot)", SHARED_FILTER_CONTROLS.every((p) => fs.existsSync(path.join(ROOT, p))));

  const failed = cases.filter((c) => !c.pass);
  for (const c of cases) console.log(`${c.pass ? "ok  " : "FAIL"} ${c.name}`);
  console.log(`[verify-one-control-height] selftest ${cases.length - failed.length}/${cases.length}`);
  if (failed.length) process.exit(1);
}

function main() {
  if (process.argv.includes("--selftest")) return selftest();

  const bad = [];
  const missing = [];
  const lines = [];
  for (const rel of SHARED_FILTER_CONTROLS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      missing.push(rel);
      continue;
    }
    const v = classifyControl(fs.readFileSync(abs, "utf8"));
    lines.push(`  ${v.ok ? "ok  " : "FAIL"} ${rel}  (${v.how})`);
    for (const o of v.offenders) lines.push(`         unsized trigger: ${o.replace(/\s+/g, " ").slice(0, 150)}`);
    if (!v.ok) bad.push(rel);
  }
  console.log(lines.join("\n"));

  if (missing.length) {
    console.log(`\nFAIL the whitelist has rotted — these paths no longer exist:\n  ${missing.join("\n  ")}`);
    console.log(`Update SHARED_FILTER_CONTROLS to the control's new path. Do not delete the entry.`);
    process.exit(1);
  }
  if (bad.length) {
    console.log(
      `\nFAIL ${bad.length} shared filter control(s) declare no height on their trigger. A control\n` +
        `sized by vertical padding renders a different height than the controls beside it, which is\n` +
        `the misalignment the owner reported. Take the height from ${TOKEN}.`,
    );
    process.exit(1);
  }
  console.log(`\n[verify-one-control-height] OK — ${SHARED_FILTER_CONTROLS.length} shared filter controls, every trigger on a declared height.`);
}

main();
