#!/usr/bin/env node
/**
 * LEAD 443.208R (CC-2) — every load / money write refreshes every load view in THIS tab immediately (the realtime bus
 * covers the other tabs and writes made anywhere else). Pinned:
 *  (a) every useMutation under dispatch/, settlements/, driver-finance/, truck-line/, accounting/, load-costs/ (pages +
 *      components) carries meta: { loads: true } — the ONE MutationCache in main.tsx then calls invalidateLoadViews;
 *  (b) no ["loads", "detail", X, ...] key whose third element is not the company (the real key is
 *      ["loads","detail",company,id]; LoadReassignModal / MultiStopEditor invalidated ["loads","detail",id] = nothing);
 *  (c) the MutationCache is wired to invalidateLoadViews on meta.loads.
 * Static, <1s. --selftest plants each regression.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-load-mutations-invalidate-load-views";
const FE = "apps/frontend/src";
const MAIN = `${FE}/main.tsx`;
const SCOPE = ["pages/dispatch", "components/dispatch", "pages/settlements", "components/settlements", "pages/driver-finance",
  "components/driver-finance", "pages/truck-line", "components/truck-line", "pages/accounting", "components/accounting",
  "pages/load-costs", "components/load-costs"].map((d) => `${FE}/${d}`);

function walk(dir, out = []) {
  const abs = path.join(ROOT, dir);
  if (!fs.existsSync(abs)) return out;
  for (const e of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) { if (e.name !== "__tests__" && e.name !== "generated") walk(rel, out); }
    else if (/\.tsx?$/.test(e.name) && !/\.test\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

export function check({ scoped, all, main }) {
  const p = [];
  for (const [file, src] of Object.entries(scoped)) {
    const re = /useMutation(?:<[^()]*?>)?\(\s*\{([\s\S]{0,400})/g;
    let m;
    while ((m = re.exec(src))) {
      const head = m[1].split(/\n\s*(?:mutationFn|onSuccess|onError|onSettled|onMutate)\s*:/)[0];
      if (!/meta:\s*\{\s*loads:\s*true\s*\}/.test(head) && !/invalidateLoadViews\(/.test(m[1])) {
        const line = src.slice(0, m.index).split("\n").length;
        p.push(`${file}:${line}: useMutation without meta: { loads: true } — this write leaves the other load views stale`);
      }
    }
    const total = (src.match(/\buseMutation(?:<[^()]*?>)?\(/g) ?? []).length;
    const objectCalls = (src.match(/useMutation(?:<[^()]*?>)?\(\s*\{/g) ?? []).length;
    if (total > objectCalls) p.push(`${file}: useMutation call this guard cannot read (not an options object) — use useMutation({ meta: { loads: true }, ... })`);
  }
  for (const [file, src] of Object.entries(all)) {
    const re = /\["loads",\s*"detail",\s*([^,\]]+)/g;
    let m;
    while ((m = re.exec(src))) {
      if (!/ompany|\bco\b/.test(m[1])) {
        const line = src.slice(0, m.index).split("\n").length;
        p.push(`${file}:${line}: ["loads","detail",${m[1].trim()},…] — the third element must be the company (real key ["loads","detail",company,id]); this matches nothing`);
      }
    }
  }
  if (!/mutationCache: new MutationCache\(\{[\s\S]*?mutation\.meta[\s\S]*?loads[\s\S]*?invalidateLoadViews\(queryClient\)/.test(main)) p.push(`${MAIN}: the MutationCache does not refresh load views on meta.loads`);
  return p;
}

function readAll() {
  const scoped = Object.fromEntries(SCOPE.flatMap((d) => walk(d)).map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
  const all = Object.fromEntries(walk(FE).map((f) => [f, fs.readFileSync(path.join(ROOT, f), "utf8")]));
  return { scoped, all, main: fs.readFileSync(path.join(ROOT, MAIN), "utf8") };
}

if (process.argv.includes("--selftest")) {
  const real = readAll();
  const base = check(real);
  if (base.length) { console.error(`${LABEL} --selftest: real tree not clean:\n  ${base.slice(0, 10).join("\n  ")}`); process.exit(1); }
  const anyScoped = Object.keys(real.scoped).find((f) => /meta: \{ loads: true \}/.test(real.scoped[f]));
  const plants = [
    ["mutation without meta", { ...real, scoped: { ...real.scoped, [anyScoped]: real.scoped[anyScoped].replace("meta: { loads: true },", "") } }],
    ["unreadable mutation", { ...real, scoped: { ...real.scoped, "x.tsx": "const m = useMutation(opts);" } }],
    ["detail key without company", { ...real, all: { ...real.all, "y.tsx": 'qc.invalidateQueries({ queryKey: ["loads", "detail", input.loadId] });' } }],
    ["MutationCache unwired", { ...real, main: real.main.replace("invalidateLoadViews(queryClient)", "void 0") }],
  ];
  let ok = 0;
  for (const [name, f] of plants) {
    const pass = check(f).length > 0;
    console.log(`  ${pass ? "PASS" : "FAIL"}  ${name}`);
    if (pass) ok++;
  }
  console.log(`${LABEL} --selftest ${ok}/${plants.length}`);
  process.exit(ok === plants.length ? 0 : 1);
}
const problems = check(readAll());
if (problems.length) { console.error(`${LABEL} FAIL — ${problems.length}:`); for (const x of problems.slice(0, 40)) console.error(`  ✗ ${x}`); process.exit(1); }
console.log(`${LABEL} PASS — every load/money mutation is tagged meta.loads and refreshes every load view; every loads/detail key carries the company`);
