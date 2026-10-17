#!/usr/bin/env node
/**
 * LEAD 443.181 (owner 2026-10-16: "the entire app must be like quickbooks clickable and must take you somewhere" ·
 * "have a coder check all tables so they are built the same way. Not guess.") — ONE table component, app-wide.
 *
 * Measured on origin/main bd1f338b7b before this step (apps/frontend/src, non-test .tsx): 46 files render a raw
 * <table> (97 sites) and 25 files render <DataTable>, beside 443 files on <ParityTable> (gear, columns, density,
 * sort, row click → record, totals footer).
 *
 *   1. A raw <table> in apps/frontend/src is allowed only in a file named in the SHRINK-ONLY allowlist
 *      18533-one-table-allowlist.json, each with the reason it is not a data list (print / PDF layout, a layout grid,
 *      the table component's own internals). More sites than its count, or a new file, fails.
 *   2. <DataTable> (incl. the generic <DataTable<Row>> form) and the other second table components —
 *      <ResizableTable>, <MobileOptimizedTable>, <ListView> — same allowlist rule (target 0).
 *   3. The allowlist only shrinks against origin/main: no file added, no count raised; a count above what the file
 *      renders today must be lowered (stale entries fail so the ratchet tightens as screens convert).
 *
 * --selftest: plants a raw <table> in a page, a <DataTable> in a page, a grown allowlist and a stale count, and
 * asserts each fails.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOW_REL = "scripts/verify-steps/18533-one-table-allowlist.json";
const SRC = "apps/frontend/src";

function frontendFiles(dir = resolve(ROOT, SRC), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (name !== "__tests__" && name !== "node_modules") frontendFiles(abs, out);
    } else if (name.endsWith(".tsx") && !/\.(test|spec)\.tsx$/.test(name)) out.push(abs);
  }
  return out;
}

const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:"'`])\/\/.*$/gm, "$1").replace(/\{\s*\}/g, "");

const TEMPLATE = /`(?:\\[\s\S]|\$\{(?:[^{}]|\{[^{}]*\})*\}|[^`\\])*`/g;

/**
 * Sites in one file (comments ignored): a rendered JSX <table>, a <DataTable>, and a <table> inside an HTML string
 * (the print window / PDF template — counted apart so every print layout is still a named exemption).
 */
export function scan(src) {
  const code = stripComments(src);
  const strings = code.match(TEMPLATE) ?? [];
  const jsx = code.replace(TEMPLATE, "``");
  return {
    raw_table: (jsx.match(/<table[\s>]/g) ?? []).length,
    print_table: strings.reduce((n, t) => n + (t.match(/<table[\s>]/g) ?? []).length, 0),
    data_table: (jsx.match(/<DataTable[\s>/<]/g) ?? []).length,
    wrapper_table: (jsx.match(/<(ResizableTable|MobileOptimizedTable|ListView)[\s>/<]/g) ?? []).length,
  };
}
const KINDS = ["raw_table", "print_table", "data_table", "wrapper_table"];
const LABEL = {
  raw_table: "raw <table>",
  print_table: "print-HTML <table>",
  data_table: "<DataTable>",
  wrapper_table: "second table component (<ResizableTable> / <MobileOptimizedTable> / <ListView>)",
};

export function check(files, allow, mainAllow) {
  const findings = [];
  const seen = new Set();
  for (const [rel, src] of files) {
    const s = scan(src);
    const cap = allow[rel];
    for (const kind of KINDS) {
      const n = s[kind];
      const max = cap?.[kind] ?? 0;
      const label = LABEL[kind];
      if (n > max) {
        findings.push(
          cap
            ? `${rel}: ${n} ${label} site(s), allowlist caps it at ${max} — render it with <ParityTable> (${kind === "data_table" ? 2 : 1})`
            : `${rel}: ${n} ${label} site(s) — every list/report table is <ParityTable> (gear, sort, row click → record, totals footer) (${kind === "data_table" ? 2 : 1})`
        );
      } else if (cap && n < max) findings.push(`${ALLOW_REL}: ${rel} ${kind} ${max} → the file renders ${n}; lower the count (3)`);
    }
    if (cap) seen.add(rel);
  }
  for (const [rel, cap] of Object.entries(allow)) {
    if (!seen.has(rel)) findings.push(`${ALLOW_REL}: ${rel} no longer exists — remove the entry (3)`);
    if (!cap.reason || cap.reason.trim().length < 12) findings.push(`${ALLOW_REL}: ${rel} carries no exemption reason (1)`);
  }
  if (mainAllow) {
    for (const [rel, cap] of Object.entries(allow)) {
      const was = mainAllow[rel];
      if (!was) findings.push(`${ALLOW_REL}: ${rel} added — the allowlist only shrinks (3)`);
      else for (const kind of KINDS) if ((cap[kind] ?? 0) > (was[kind] ?? 0)) findings.push(`${ALLOW_REL}: ${rel} ${kind} raised ${was[kind] ?? 0} → ${cap[kind]} — the allowlist only shrinks (3)`);
    }
  }
  return findings;
}

function load() {
  const files = frontendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const allow = JSON.parse(readFileSync(resolve(ROOT, ALLOW_REL), "utf8")).sites;
  let mainAllow = null;
  const r = spawnSync("git", ["show", `origin/main:${ALLOW_REL}`], { cwd: ROOT, encoding: "utf8" });
  if (r.status === 0) mainAllow = JSON.parse(r.stdout).sites;
  return { files, allow, mainAllow };
}

const isMain = process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (isMain && process.argv.includes("--selftest")) {
  const { files, allow, mainAllow } = load();
  const base = check(files, allow, mainAllow);
  if (base.length) {
    console.error("SELFTEST FAIL: baseline not clean", base);
    process.exit(1);
  }
  const [allowRel, allowCap] = Object.entries(allow)[0] ?? [];
  const plants = [
    ["raw <table> in a page", [...files, [`${SRC}/pages/x/XPage.tsx`, "export const X = () => <table className=\"w-full\"><tbody /></table>;"]], allow, mainAllow],
    ["generic <DataTable<Row>> in a page", [...files, [`${SRC}/pages/x/GPage.tsx`, "export const G = () => <DataTable<Row> columns={[]} rows={[]} />;"]], allow, mainAllow],
    ["<ResizableTable> in a page", [...files, [`${SRC}/pages/x/RPage.tsx`, "export const R = () => <ResizableTable columns={[]} />;"]], allow, mainAllow],
    ["<DataTable> in a page", [...files, [`${SRC}/pages/x/YPage.tsx`, "export const Y = () => <DataTable columns={[]} rows={[]} />;"]], allow, mainAllow],
    ["allowlist grows", [...files, [`${SRC}/pages/x/ZPage.tsx`, "export const Z = () => <table />;"]], { ...allow, [`${SRC}/pages/x/ZPage.tsx`]: { raw_table: 1, data_table: 0, reason: "a print layout for the plant" } }, mainAllow ?? allow],
    ["no reason", files, allowRel ? { ...allow, [allowRel]: { ...allowCap, reason: "" } } : { x: { raw_table: 0, data_table: 0, reason: "" } }, null],
    ["stale count", files, allowRel ? { ...allow, [allowRel]: { ...allowCap, raw_table: (allowCap.raw_table ?? 0) + 1 } } : { x: { raw_table: 1, reason: "a print layout for the plant" } }, null],
  ];
  for (const [name, f, a, m] of plants) {
    if (check(f, a, m).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

if (isMain) {
  const { files, allow, mainAllow } = load();
  const findings = check(files, allow, mainAllow);
  if (findings.length) {
    console.error(`verify-one-table-component FAIL (${findings.length}):`);
    for (const f of findings) console.error(`  ${f}`);
    process.exit(1);
  }
  const total = Object.values(allow).reduce((a, c) => a + KINDS.reduce((n, k) => n + (c[k] ?? 0), 0), 0);
  const pending = Object.values(allow).filter((c) => /PENDING/.test(c.reason)).length;
  console.log(
    `verify-one-table-component PASS: ${Object.keys(allow).length} allowlisted file(s), ${total} site(s) (shrink-only)` +
      (pending ? `; ${pending} file(s) still PENDING conversion to <ParityTable>` : "; every list/report table is <ParityTable>")
  );
}
