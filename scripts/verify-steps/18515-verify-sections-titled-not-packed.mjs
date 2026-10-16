#!/usr/bin/env node
/**
 * LEAD 443.174 — every section has its real title, nothing is packed by default, Summary and Detail are different views,
 * and explanatory notices live behind an info button (owner 10-16: "each section needs its correct title … in the entire
 * app"; "by default it should not be so packed in any screen"; "the messages or info that appears should not be
 * permanent … it should not make my screen smaller"; "it has summary and detail. but it shows the same data").
 *
 * Over apps/frontend/src/pages/** (tests aside):
 *   (a) untitled — a <ParityTable>/<DataTable>/<ListView> with no `title=` prop and no heading in the 20 lines above it
 *       (h1–h4, text-section-header, SectionTitle/CardTitle, or a wrapping Section/Card/DataPanel with a title= prop);
 *       a GENERIC title ("Lines", "Detail", "Table", "Report", "List", …) counts as no title.
 *   (b) same-rows toggle — a "summary" | "detail" view state that no render expression ever branches on
 *       (the toggle flips a value nothing reads, so both views render the same rows).
 *   (c) inline notice — a <p> whose static text is >= 160 characters (two lines at 12px) outside an <InfoPopover>.
 * Counts per file are ratcheted in 18515-sections-titled-baseline.json: a file may only go DOWN; a new file must be 0;
 * the baseline itself may only shrink against origin/main.
 *
 *   --census        print counts per module (the 443.174 census) and exit 0
 *   --write-baseline rewrite the baseline from the tree (only allowed when every count is <= the current baseline)
 *   --selftest      plant each regression and assert the guard fails
 */
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const PAGES = "apps/frontend/src/pages";
const BASELINE_REL = "scripts/verify-steps/18515-sections-titled-baseline.json";
const NOTICE_MIN_CHARS = 160;

function pageFiles(dir = resolve(ROOT, PAGES), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") pageFiles(abs, out);
    } else if (name.endsWith(".tsx") && !/\.test\.tsx$/.test(name)) out.push(abs);
  }
  return out;
}

/** The opening tag starting at `i` (at "<"), ending at its unnested ">" — braces and quotes respected. */
export function openingTag(src, i) {
  let depth = 0;
  let q = null;
  // `<ParityTable<Row> …>` — skip the balanced type argument right after the tag name; its ">" is not the tag's end.
  let start = i + 1;
  const name = /^[A-Za-z][\w.]*/.exec(src.slice(start));
  if (name) {
    start += name[0].length;
    if (src[start] === "<") {
      let g = 0;
      for (; start < src.length; start += 1) {
        if (src[start] === "<") g += 1;
        else if (src[start] === ">" && --g === 0) { start += 1; break; }
      }
    }
  }
  for (let k = start; k < src.length; k += 1) {
    const ch = src[k];
    if (q) {
      if (ch === q && src[k - 1] !== "\\") q = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === "`") q = ch;
    else if (ch === "{") depth += 1;
    else if (ch === "}") depth -= 1;
    else if (ch === ">" && depth === 0) return src.slice(i, k + 1);
  }
  return src.slice(i);
}

/** A tag's top-level attribute names (attributes inside {...} expressions are not the tag's own). */
export function topLevelAttrs(tag) {
  const names = [];
  let depth = 0;
  let q = null;
  let flat = "";
  for (let k = 0; k < tag.length; k += 1) {
    const ch = tag[k];
    if (q) {
      if (ch === q && tag[k - 1] !== "\\") q = null;
      continue;
    }
    if (depth === 0 && (ch === '"' || ch === "'" || ch === "`")) { q = ch; flat += " "; continue; }
    if (ch === "{") { depth += 1; continue; }
    if (ch === "}") { depth -= 1; continue; }
    if (depth === 0) flat += ch;
  }
  for (const m of flat.matchAll(/\s([A-Za-z][\w-]*)=/g)) names.push(m[1]);
  return names;
}

const HEADING = /<h[1-4][\s>]|text-section-header|<SectionTitle\b|<CardTitle\b|<(?:Section|SectionCard|Card|Panel|DataPanel|Modal|Drawer)\b[^>]*\btitle=/;
const HEADING_TEXT = /<(?:Section|SectionCard|Card|Panel|DataPanel|Modal|Drawer)\b[^>]*\btitle="([^"]*)"|<h[1-4][^>]*>\s*([^<{]+?)\s*<\/h[1-4]>|text-section-header[^>]*>\s*([^<{]+?)\s*</g;
export const GENERIC_TITLE = /^(lines?|details?|table|report|list|items?|data|results?|records?|rows?|entries)$/i;
const literalTitle = (tag) => (tag.match(/\stitle="([^"]*)"/) ?? [])[1];

export function scan(src) {
  const counts = { untitled: 0, same_rows_toggle: 0, inline_notice: 0 };
  const lines = src.split("\n");
  const lineOf = (idx) => src.slice(0, idx).split("\n").length - 1;
  // (a)
  for (const m of src.matchAll(/<(ParityTable|DataTable|ListView)\b/g)) {
    const tag = openingTag(src, m.index);
    if (topLevelAttrs(tag).includes("title")) {
      const t = literalTitle(tag);
      if (t != null && GENERIC_TITLE.test(t.trim())) counts.untitled += 1;
      continue;
    }
    const ln = lineOf(m.index);
    const above = lines.slice(Math.max(0, ln - 20), ln).join("\n");
    if (!HEADING.test(above)) {
      counts.untitled += 1;
      continue;
    }
    const texts = [...above.matchAll(HEADING_TEXT)].map((h) => (h[1] ?? h[2] ?? h[3] ?? "").trim()).filter(Boolean);
    const nearest = texts[texts.length - 1];
    if (nearest && GENERIC_TITLE.test(nearest)) counts.untitled += 1;
  }
  // (b)
  for (const m of src.matchAll(/const \[(\w+),\s*set\w+\]\s*=\s*useState(?:<[^>]*>)?\(\s*["'](summary|detail)["']\s*\)/g)) {
    const v = m[1];
    const branches = new RegExp(`\\b${v}\\s*(?:===|!==|==|!=)\\s*["'](?:summary|detail)["']|["'](?:summary|detail)["']\\s*(?:===|!==)\\s*${v}\\b|\\b${v}\\s*\\?|switch\\s*\\(\\s*${v}\\s*\\)`);
    // the toggle's own active-state styling is not a render branch: drop lines that only style a button
    const body = src.split("\n").filter((l) => !/aria-pressed|className=|variant=/.test(l)).join("\n");
    if (!branches.test(body)) counts.same_rows_toggle += 1;
  }
  // (c)
  // JSX / block comments are not rendered: a literal "<p>" in a comment is not a notice
  const noPopover = src.replace(/\{\/\*[\s\S]*?\*\/\}/g, "").replace(/\/\*[\s\S]*?\*\//g, "").replace(/<InfoPopover\b[\s\S]*?<\/InfoPopover>/g, "");
  for (const m of noPopover.matchAll(/<p\b/g)) {
    const tag = openingTag(noPopover, m.index);
    if (tag.endsWith("/>")) continue;
    const end = noPopover.indexOf("</p>", m.index + tag.length);
    if (end < 0) continue;
    let text = noPopover.slice(m.index + tag.length, end);
    // strip every {...} expression, innermost first (template literals nest any depth): only static text counts
    while (/\{[^{}]*\}/.test(text)) text = text.replace(/\{[^{}]*\}/g, " ");
    text = text
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (text.length >= NOTICE_MIN_CHARS) counts.inline_notice += 1;
  }
  return counts;
}

const KEYS = ["untitled", "same_rows_toggle", "inline_notice"];

export function check(files, baseline, mainBaseline) {
  const findings = [];
  for (const [rel, src] of files) {
    const c = scan(src);
    const cap = baseline[rel] ?? { untitled: 0, same_rows_toggle: 0, inline_notice: 0 };
    for (const k of KEYS) {
      if (c[k] > (cap[k] ?? 0)) findings.push(`${rel}: ${k} ${c[k]} > baseline ${cap[k] ?? 0}`);
    }
  }
  if (mainBaseline) {
    for (const [rel, cap] of Object.entries(baseline)) {
      const was = mainBaseline[rel];
      for (const k of KEYS) {
        if ((cap[k] ?? 0) > (was?.[k] ?? 0)) findings.push(`${BASELINE_REL}: ${rel} ${k} raised ${was?.[k] ?? 0} → ${cap[k]} — the baseline only shrinks`);
      }
    }
  }
  return findings;
}

function load() {
  const files = pageFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const baseline = existsSync(resolve(ROOT, BASELINE_REL)) ? JSON.parse(readFileSync(resolve(ROOT, BASELINE_REL), "utf8")).files : {};
  const r = spawnSync("git", ["show", `origin/main:${BASELINE_REL}`], { cwd: ROOT, encoding: "utf8" });
  const mainBaseline = r.status === 0 ? JSON.parse(r.stdout).files : null;
  return { files, baseline, mainBaseline };
}

const moduleOf = (rel) => rel.slice(PAGES.length + 1).split("/")[0].replace(/\.tsx$/, "");
const totals = (files) => files.reduce((t, [, s]) => { const c = scan(s); for (const k of KEYS) t[k] += c[k]; return t; }, { untitled: 0, same_rows_toggle: 0, inline_notice: 0 });

if (process.argv.includes("--census")) {
  const { files } = load();
  const byModule = {};
  for (const [rel, src] of files) {
    const c = scan(src);
    const m = (byModule[moduleOf(rel)] ??= { untitled: 0, same_rows_toggle: 0, inline_notice: 0, files: [] });
    for (const k of KEYS) m[k] += c[k];
    if (KEYS.some((k) => c[k])) m.files.push(`${rel.slice(PAGES.length + 1)} (${KEYS.map((k) => c[k]).join("/")})`);
  }
  const rows = Object.entries(byModule).filter(([, v]) => KEYS.some((k) => v[k])).sort((a, b) => b[1].untitled + b[1].inline_notice - (a[1].untitled + a[1].inline_notice));
  if (process.argv.includes("--json")) console.log(JSON.stringify(Object.fromEntries(rows), null, 1));
  else for (const [mod, v] of rows) console.log(`${mod.padEnd(34)} untitled ${String(v.untitled).padStart(3)}  same-rows ${String(v.same_rows_toggle).padStart(2)}  notices ${String(v.inline_notice).padStart(3)}`);
  const t = totals(files);
  console.log(`TOTAL untitled ${t.untitled} · same-rows toggles ${t.same_rows_toggle} · inline notices ${t.inline_notice} · files ${files.length}`);
  process.exit(0);
}

if (process.argv.includes("--write-baseline")) {
  const { files, baseline } = load();
  const out = {};
  for (const [rel, src] of files) {
    const c = scan(src);
    if (!KEYS.some((k) => c[k])) continue;
    const cap = baseline[rel];
    if (cap && KEYS.some((k) => c[k] > (cap[k] ?? 0)) && !process.argv.includes("--init")) {
      console.error(`refusing: ${rel} grew past its baseline — fix it, never raise the baseline`);
      process.exit(1);
    }
    out[rel] = c;
  }
  writeFileSync(resolve(ROOT, BASELINE_REL), `${JSON.stringify({ note: "LEAD 443.174 — shrink-only. Fix the screen; never raise a count.", files: out }, null, 2)}\n`);
  const t = totals(files);
  console.log(`baseline written: untitled ${t.untitled} · same-rows ${t.same_rows_toggle} · notices ${t.inline_notice}`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) {
  const { files, baseline, mainBaseline } = load();
  const base = check(files, baseline, mainBaseline);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base.slice(0, 5));
    process.exit(1);
  }
  const NEW = "apps/frontend/src/pages/__selftest__/New.tsx";
  const long = "This explains at length what every column means and why the totals may differ from the bank, so read all of it before you post anything at all.";
  const plants = [
    ["untitled table", [...files, [NEW, `export function X(){return (<div><ParityTable columns={c} rows={r} rowKey={(x) => x.id} /></div>);}`]]],
    ["generic title", [...files, [NEW, `export function X(){return (<ParityTable title="Lines" columns={c} rows={r} rowKey={(x) => x.id} />);}`]]],
    ["generic panel title", [...files, [NEW, `export function X(){return (<DataPanel title="Details">\n<ParityTable columns={c} rows={r} rowKey={(x) => x.id} /></DataPanel>);}`]]],
    ["generic tag untitled", [...files, [NEW, `export function X(){return (<ParityTable<Row> columns={c} rows={r} rowKey={(x) => x.id} />);}`]]],
    ["title only inside a column", [...files, [NEW, `export function X(){return (<ParityTable columns={[{ key: "a", title: "A" }]} rows={r} rowKey={(x) => x.id} />);}`]]],
    ["same-rows toggle", [...files, [NEW, `export function X(){const [view, setView] = useState<"summary" | "detail">("summary");return (<div><h2>Bills</h2><button onClick={() => setView("detail")}>Detail</button><ParityTable title="Bills" columns={c} rows={rows} rowKey={(x) => x.id} /></div>);}`]]],
    ["inline notice", [...files, [NEW, `export function X(){return (<p className="text-xs">${long} ${long}</p>);}`]]],
    ["notice after a comment", [...files, [NEW, `export function X(){return (<div>{/* the <p> below */}<p className="text-xs">${long} ${long}</p></div>);}`]]],
    ["baseline raised", files, { ...baseline, [NEW]: { untitled: 9, same_rows_toggle: 0, inline_notice: 0 } }, mainBaseline ?? baseline],
  ];
  // the guard must also PASS the clean forms
  const clean = [
    [NEW, `export function X(){return (<ParityTable title="Bills — open" columns={c} rows={r} rowKey={(x) => x.id} />);}`],
    [NEW, `export function X(){const [view, setView] = useState<"summary" | "detail">("summary");return view === "summary" ? <A /> : <B />;}`],
    [NEW, `export function X(){return (<InfoPopover label="About"><p>${long} ${long}</p></InfoPopover>);}`],
    [NEW, `export function X(){return (<div>{/* a hardcoded <p> once said: ${long} ${long} </p> */}<span /></div>);}`],
  ];
  for (const c of clean) {
    if (check([...files, c], baseline, mainBaseline).length) {
      console.error(`SELFTEST FAIL: clean form flagged: ${c[1].slice(0, 80)}`);
      process.exit(1);
    }
  }
  for (const [name, f, b, m] of plants) {
    if (check(f, b ?? baseline, m ?? mainBaseline).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught, ${clean.length} clean forms pass`);
  process.exit(0);
}

const { files, baseline, mainBaseline } = load();
const findings = check(files, baseline, mainBaseline);
if (findings.length) {
  console.error(`verify-sections-titled-not-packed FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
const t = totals(files);
console.log(`verify-sections-titled-not-packed PASS: untitled ${t.untitled} · same-rows toggles ${t.same_rows_toggle} · inline notices ${t.inline_notice} (shrink-only baseline)`);
