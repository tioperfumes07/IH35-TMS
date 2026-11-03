#!/usr/bin/env node
/**
 * LEAD 11-03 — register rows 196 204 208 226 227 232 234 (design audit D018 D028 D032 D050 D051 D056 D058):
 * single-line form fields on seven screens measured 28 / 30.67 / 38px instead of the owner-law 40px field
 * (--ih-h-field, FORM_INPUT_CLASS h-10, FORM_FIELD_CONTROL_SIZE_CLASS h-10), and date fields stretched to
 * ~1,200px instead of the 132px date box (--ih-w-date).
 *
 * Root cause: each screen hand-typed its own field class (h-7/h-8/h-9, later patched to literal h-10), and
 * the shared pickers were dropped in with their FILTER defaults — Combobox/EntityPicker default size "md"
 * paints the 34px filter frame, SelectCombobox had NO size prop at all (always 34px), DatePicker without
 * box="field" falls back to h-9 and the container's full width, DateTimePicker had no field height.
 *
 * This guard pins the permanent fix: on every touched surface a raw single-line <input> uses FORM_INPUT_CLASS,
 * every picker opts into the 40px form size (size="sm"), every date uses box="field"; and the shared
 * components keep the size plumbing. --selftest plants a raw/overridden control back into each file.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-inputs-use-shared-height";
const FE = "apps/frontend/src";

/** [row, file, optional region start marker, optional region end marker] */
export const SURFACES = [
  ["196", `${FE}/components/fuel/AssignFuelCardDrawer.tsx`],
  ["204", `${FE}/components/tasks/CreateTaskModal.tsx`],
  ["208", `${FE}/pages/safety/driver-scheduler/DriverSchedulerGridPage.tsx`, 'title="Assign temp cover"', "</Modal>"],
  ["226", `${FE}/pages/inventory/PartCreateDrawer.tsx`],
  ["227", `${FE}/pages/form425c/tabs/ProfilesTab.tsx`],
  ["232", `${FE}/components/documents/UploadModal.tsx`],
  ["234", `${FE}/pages/Users.tsx`, 'title="Create User"', "</form>"],
];

const PICKERS = ["SelectCombobox", "Combobox", "EntityPicker", "DriverPickerWithCreate", "ReferenceSelect"];
const NON_TEXT_INPUT = /\btype="(checkbox|radio|file|hidden|range|color)"/;

/** Every opening JSX tag `<Tag ...>` (attrs only), brace/quote aware. */
export function jsxTags(src, tag) {
  const out = [];
  const re = new RegExp(`<${tag}(?=[\\s/>])`, "g");
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let depth = 0;
    let quote = null;
    for (; i < src.length; i++) {
      const c = src[i];
      if (quote) {
        if (c === quote && src[i - 1] !== "\\") quote = null;
        continue;
      }
      if (depth === 0 && (c === '"' || c === "'")) quote = c;
      else if (c === "{") depth++;
      else if (c === "}") depth--;
      else if (c === ">" && depth === 0) break;
    }
    out.push({ at: m.index, attrs: src.slice(m.index + m[0].length, i) });
  }
  return out;
}

function region(src, start, end) {
  if (!start) return src;
  const a = src.indexOf(start);
  if (a < 0) return null;
  const b = src.indexOf(end, a);
  return src.slice(a, b < 0 ? undefined : b);
}

export function surfaceDefects(row, src, start, end) {
  const out = [];
  const body = region(src, start, end);
  if (body == null) return [`row ${row}: region marker ${start} not found`];
  for (const { attrs } of jsxTags(body, "input")) {
    if (NON_TEXT_INPUT.test(attrs)) continue;
    if (!/className=\{[^}]*FORM_INPUT_CLASS/.test(attrs) && !/className=\{inputCls\}/.test(attrs)) {
      out.push(`row ${row}: raw single-line <input> without FORM_INPUT_CLASS: ${attrs.trim().slice(0, 90).replace(/\s+/g, " ")}`);
    }
    if (/className="[^"]*\b(min-)?h-\d/.test(attrs)) out.push(`row ${row}: <input> hand-types its own height`);
  }
  // A local inputCls alias must itself be the shared token.
  const alias = /const inputCls = (.+);/.exec(src);
  if (alias && !/FORM_INPUT_CLASS/.test(alias[1])) out.push(`row ${row}: local inputCls is not FORM_INPUT_CLASS`);
  for (const tag of PICKERS) {
    for (const { attrs } of jsxTags(body, tag)) {
      if (!/\bsize="sm"/.test(attrs)) out.push(`row ${row}: <${tag}> in a form without size="sm" (paints the 34px filter frame)`);
      if (/className="[^"]*\b(min-)?h-\d/.test(attrs)) out.push(`row ${row}: <${tag}> hand-types a height`);
    }
  }
  for (const tag of ["DatePicker", "DateTimePicker"]) {
    for (const { attrs } of jsxTags(body, tag)) {
      if (!/\bbox="field"/.test(attrs)) out.push(`row ${row}: <${tag}> without box="field" (h-9 / full-width fallback)`);
    }
  }
  return out;
}

export function sharedDefects({ combobox, inputClass, tokens, dateTime, datePicker }) {
  const out = [];
  if (!/export const FORM_INPUT_CLASS = "h-10 /.test(inputClass)) out.push("FORM_INPUT_CLASS is not the 40px h-10 field");
  if (!/export const FORM_FIELD_CONTROL_SIZE_CLASS = "h-10 /.test(tokens)) out.push("FORM_FIELD_CONTROL_SIZE_CLASS is not h-10");
  const sel = combobox.slice(combobox.indexOf("type SelectComboboxProps"));
  if (!/size\?: "md" \| "sm";/.test(sel.slice(0, sel.indexOf("};")))) out.push("SelectCombobox has no size prop");
  const selFn = combobox.slice(combobox.indexOf("export function SelectCombobox("));
  if (!/<SimpleCombobox[\s\S]*?size=\{size\}/.test(selFn)) out.push("SelectCombobox does not forward size");
  const simple = combobox.slice(combobox.indexOf("export function SimpleCombobox("), combobox.indexOf("export function SelectCombobox("));
  if (!/<Combobox[\s\S]*?size=\{size\}/.test(simple)) out.push("SimpleCombobox does not forward size");
  if (!/size === "sm" \? FORM_FIELD_CONTROL_SIZE_CLASS/.test(combobox)) out.push('Combobox size="sm" no longer maps to FORM_FIELD_CONTROL_SIZE_CLASS');
  if (!/box === "field" \? \{ height: "var\(--ih-h-field\)" \}/.test(dateTime)) out.push('DateTimePicker box="field" no longer takes --ih-h-field');
  if (!/box === "field" \? "var\(--ih-h-field\)"/.test(datePicker)) out.push('DatePicker box="field" no longer takes --ih-h-field');
  if (!/width: "var\(--ih-w-date\)"/.test(datePicker)) out.push("DatePicker box no longer takes the 132px --ih-w-date width");
  return out;
}

const read = (rel) => readFileSync(path.join(ROOT, rel), "utf8");
const shared = {
  combobox: read(`${FE}/components/Combobox.tsx`),
  inputClass: read(`${FE}/components/forms/inputClass.ts`),
  tokens: read(`${FE}/design/tokens.ts`),
  dateTime: read(`${FE}/components/forms/DateTimePicker.tsx`),
  datePicker: read(`${FE}/components/forms/DatePicker.tsx`),
};
const sources = SURFACES.map(([row, file, start, end]) => ({ row, file, start, end, src: read(file) }));

function allDefects(srcs, sh) {
  return [...srcs.flatMap((s) => surfaceDefects(s.row, s.src, s.start, s.end)), ...sharedDefects(sh)];
}

if (process.argv.includes("--selftest")) {
  const plants = [];
  for (const s of sources) {
    const body = region(s.src, s.start, s.end);
    // Plant 1: a picker or date in the region loses its form size (filter frame / h-9 fallback).
    const pickerPlant = body.includes('size="sm"')
      ? s.src.replace(body, body.replace(/\s*size="sm"/, ""))
      : s.src.replace(body, body.replace(/box="field"/, 'className="h-9 w-full"'));
    plants.push([`row ${s.row}: picker/date drops its 40px form size`, s.row, pickerPlant]);
    // Plant 2: a raw hand-typed input back into the region (an existing shared field reverted, else a new one).
    const reverted = body.replace(/className=\{(`mt-1 \$\{FORM_INPUT_CLASS\}[^`]*`|FORM_INPUT_CLASS|inputCls)\}/, 'className="mt-1 h-9 w-full rounded-sm border px-2 text-xs"');
    const rawPlant = s.src.replace(body, reverted !== body ? reverted : `${body}<input className="mt-1 h-9 w-full rounded-sm border px-2 text-xs" />`);
    plants.push([`row ${s.row}: raw hand-typed <input> h-9`, s.row, rawPlant]);
  }
  const sharedPlants = [
    ["SelectCombobox loses size prop", { ...shared, combobox: shared.combobox.replace(/(type SelectComboboxProps[\s\S]*?)size\?: "md" \| "sm";/, "$1") }],
    ["SelectCombobox stops forwarding size", { ...shared, combobox: shared.combobox.replace(/(export function SelectCombobox\([\s\S]*?)size=\{size\}/, "$1") }],
    ["FORM_INPUT_CLASS back to h-9", { ...shared, inputClass: shared.inputClass.replace('FORM_INPUT_CLASS = "h-10 ', 'FORM_INPUT_CLASS = "h-9 ') }],
    ["DateTimePicker field height removed", { ...shared, dateTime: shared.dateTime.replace('box === "field" ? { height: "var(--ih-h-field)" }', "undefined") }],
  ];
  let caught = 0;
  let total = 0;
  for (const [name, row, planted] of plants) {
    total++;
    const srcs = sources.map((s) => (s.row === row ? { ...s, src: planted } : s));
    const hit = planted !== sources.find((s) => s.row === row).src && allDefects(srcs, shared).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  for (const [name, sh] of sharedPlants) {
    total++;
    const changed = Object.keys(sh).some((k) => sh[k] !== shared[k]);
    const hit = changed && sharedDefects(sh).length > 0;
    console.log(`${hit ? "ok  " : "MISS"}  plant: ${name}`);
    if (hit) caught++;
  }
  console.log(`${LABEL} SELFTEST: ${caught}/${total} planted defects caught`);
  process.exit(caught === total ? 0 : 1);
}

const defects = allDefects(sources, shared);
if (defects.length) {
  console.error(`${LABEL} FAIL:\n - ${defects.join("\n - ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — ${SURFACES.length} surfaces: raw inputs use FORM_INPUT_CLASS, pickers size="sm", dates box="field"`);
