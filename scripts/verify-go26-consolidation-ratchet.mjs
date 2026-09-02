#!/usr/bin/env node
/**
 * GO-26-CONSOLIDATION-RATCHET (owner ruling 2026-09-02, routed=CC-2).
 *
 * Jorge: "consolidate so every screen gets fixed at once." Before touching any of the 277
 * files behind the K2/J1 conversion work, this guard freezes today's sprawl so nothing NEW
 * lands behind the conversion while it's in flight — exactly how 2,213 hardcoded sizes and
 * 277 trapping pickers accumulated the first time (no guard shipped before the work started).
 *
 * Ratchet = backslide lock, not the plan. It only fails when a count goes UP.
 *
 * Eight metrics, each frozen at today's measured count:
 *   1. imports of components/shared/SelectCombobox   (trapping picker — RETIRE target)
 *   2. imports of components/parity/EntityPicker      (trapping picker — RETIRE target)
 *   3. imports of components/shared/Combobox          (trapping picker — RETIRE target;
 *      distinct from the good bare components/Combobox.tsx, which stays unrestricted)
 *   4. imports of components/DataTable
 *   5. imports of components/shared/ResizableTable
 *   6. imports of components/shared/MobileOptimizedTable
 *   7. raw <table> outside the 6 infrastructure files that legitimately implement one
 *      (components/DataTable.tsx, components/FleetTable.tsx, components/lists/ListView/
 *      ListView.tsx, components/parity/ParityTable.tsx, components/shared/
 *      MobileOptimizedTable.tsx, components/shared/ResizableTable.tsx)
 *   8. raw text-[Npx] off the locked scale (11 / 12 / 22) — same measure as
 *      verify-ui-design-system-ratchet.mjs, folded in here per the owner's consolidation
 *      ruling so one guard covers the whole sprawl class, not two overlapping ones.
 *
 * Baseline: scripts/go26-consolidation-baseline.json  (committed, only ever goes down)
 *
 *   node scripts/verify-go26-consolidation-ratchet.mjs              check
 *   node scripts/verify-go26-consolidation-ratchet.mjs --selftest   self-check, no repo scan
 *   node scripts/verify-go26-consolidation-ratchet.mjs --lower      rewrite baseline DOWN only
 *   node scripts/verify-go26-consolidation-ratchet.mjs --worklist   per-file offender counts
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-go26-consolidation-ratchet";
const BASELINE = path.join(ROOT, "scripts", "go26-consolidation-baseline.json");
const SRC = path.join(ROOT, "apps", "frontend", "src");

const IMPORT_TARGETS = [
  "components/shared/SelectCombobox",
  "components/parity/EntityPicker",
  "components/shared/Combobox",
  "components/DataTable",
  "components/shared/ResizableTable",
  "components/shared/MobileOptimizedTable",
];

/** The only files allowed to hand-roll a raw <table> — everything else routes through one. */
const TABLE_INFRA_FILES = new Set(
  [
    "components/DataTable.tsx",
    "components/FleetTable.tsx",
    "components/lists/ListView/ListView.tsx",
    "components/parity/ParityTable.tsx",
    "components/shared/MobileOptimizedTable.tsx",
    "components/shared/ResizableTable.tsx",
  ].map((p) => path.join(SRC, p))
);

const LOCKED_SIZES_PX = new Set(["11", "12", "22"]);
const RAW_SIZE = /\btext-\[([0-9.]+)px\]/g;
const RAW_TABLE = /<table[\s>]/i;

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) { walk(p, out); continue; }
    if (!/\.tsx?$/.test(e.name)) continue;
    if (/\.test\.tsx?$/.test(e.name)) continue;
    if (/\.usage\.example\.tsx?$/.test(e.name)) continue;
    out.push(p);
  }
  return out;
}

function measure() {
  const files = walk(SRC);
  const importCounts = Object.fromEntries(IMPORT_TARGETS.map((t) => [t, 0]));
  const importFiles = Object.fromEntries(IMPORT_TARGETS.map((t) => [t, []]));
  let rawTableCount = 0;
  const rawTableFiles = [];
  let offScaleCount = 0;
  const offPerFile = new Map();

  for (const f of files) {
    const s = fs.readFileSync(f, "utf8");

    for (const target of IMPORT_TARGETS) {
      // Match an import/require specifier ending in the target path, quoted, so
      // components/shared/Combobox never matches a components/shared/SelectCombobox import.
      const re = new RegExp(`["'\`][^"'\`]*${target.replace(/\//g, "\\/")}["'\`]`);
      if (re.test(s)) {
        importCounts[target] += 1;
        importFiles[target].push(f);
      }
    }

    if (RAW_TABLE.test(s) && !TABLE_INFRA_FILES.has(f)) {
      rawTableCount += 1;
      rawTableFiles.push(f);
    }

    let mm;
    RAW_SIZE.lastIndex = 0;
    while ((mm = RAW_SIZE.exec(s)) !== null) {
      if (!LOCKED_SIZES_PX.has(mm[1])) {
        offScaleCount += 1;
        offPerFile.set(f, (offPerFile.get(f) || 0) + 1);
      }
    }
  }

  return {
    import_select_combobox: importCounts["components/shared/SelectCombobox"],
    import_entity_picker: importCounts["components/parity/EntityPicker"],
    import_shared_combobox: importCounts["components/shared/Combobox"],
    import_data_table: importCounts["components/DataTable"],
    import_resizable_table: importCounts["components/shared/ResizableTable"],
    import_mobile_optimized_table: importCounts["components/shared/MobileOptimizedTable"],
    raw_table_outside_infra: rawTableCount,
    raw_text_off_locked_scale: offScaleCount,
    _importFiles: importFiles,
    _rawTableFiles: rawTableFiles,
    _offPerFile: offPerFile,
  };
}

function flatten(o) {
  return {
    import_select_combobox: o.import_select_combobox,
    import_entity_picker: o.import_entity_picker,
    import_shared_combobox: o.import_shared_combobox,
    import_data_table: o.import_data_table,
    import_resizable_table: o.import_resizable_table,
    import_mobile_optimized_table: o.import_mobile_optimized_table,
    raw_table_outside_infra: o.raw_table_outside_infra,
    raw_text_off_locked_scale: o.raw_text_off_locked_scale,
  };
}

function selftest() {
  const probe = {
    import_select_combobox: 1, import_entity_picker: 2, import_shared_combobox: 3,
    import_data_table: 4, import_resizable_table: 5, import_mobile_optimized_table: 6,
    raw_table_outside_infra: 7, raw_text_off_locked_scale: 8,
  };
  const f = flatten(probe);
  const ok = f.import_select_combobox === 1 && f.raw_text_off_locked_scale === 8;
  if (!ok) { console.error(`${LABEL}: SELFTEST FAIL — flatten() wrong`); process.exit(1); }
  if (!fs.existsSync(SRC)) { console.error(`${LABEL}: SELFTEST FAIL — ${SRC} missing`); process.exit(1); }
  console.log(`${LABEL}: SELFTEST PASS`);
  process.exit(0);
}

function loadBaseline() {
  if (!fs.existsSync(BASELINE)) {
    console.error(`${LABEL}: FAIL — no baseline at ${BASELINE}. Run --lower once to create it.`);
    process.exit(1);
  }
  return JSON.parse(fs.readFileSync(BASELINE, "utf8"));
}

function saveBaseline(flat) {
  fs.writeFileSync(BASELINE, JSON.stringify(flat, null, 2) + "\n");
}

const argv = process.argv.slice(2);

if (argv.includes("--selftest")) selftest();

if (argv.includes("--worklist")) {
  const m = measure();
  for (const target of IMPORT_TARGETS) {
    const files = m._importFiles[target];
    if (!files.length) continue;
    console.log(`\n${target} (${files.length} files):`);
    for (const f of files) console.log(`  ${path.relative(ROOT, f)}`);
  }
  console.log(`\nraw <table> outside infra (${m._rawTableFiles.length} files):`);
  for (const f of m._rawTableFiles) console.log(`  ${path.relative(ROOT, f)}`);
  console.log(`\nraw off-scale text-[Npx] (${m._offPerFile.size} files):`);
  for (const [f, n] of [...m._offPerFile.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`  ${String(n).padStart(3)}  ${path.relative(ROOT, f)}`);
  }
  process.exit(0);
}

const measured = flatten(measure());

if (argv.includes("--lower")) {
  const prior = fs.existsSync(BASELINE) ? JSON.parse(fs.readFileSync(BASELINE, "utf8")) : null;
  saveBaseline(measured);
  if (!prior) {
    console.log(`${LABEL}: baseline created.`);
    for (const [k, v] of Object.entries(measured)) console.log(`  ${k}: ${v}`);
  } else {
    console.log(`${LABEL}: baseline lowered.`);
    for (const k of Object.keys(measured)) {
      const before = prior[k] ?? 0;
      const after = measured[k];
      if (after !== before) console.log(`  ${k}: ${before} -> ${after}  (${after - before})`);
    }
  }
  process.exit(0);
}

const baseline = loadBaseline();
const regressions = [];
const improvements = [];
for (const k of Object.keys(measured)) {
  const before = baseline[k] ?? 0;
  const after = measured[k];
  if (after > before) regressions.push(`  REGRESSION  ${k}: ${before} -> ${after}  (+${after - before})`);
  else if (after < before) improvements.push(`  improved    ${k}: ${before} -> ${after}  (${after - before})`);
}

if (regressions.length) {
  console.error(`${LABEL}: FAIL — new sprawl since baseline. NEVER raise the baseline to pass; fix the file.`);
  for (const r of regressions) console.error(r);
  process.exit(1);
}

console.log(`${LABEL}: PASS`);
for (const i of improvements) console.log(i);
if (improvements.length) console.log(`  run with --lower to bank it into the baseline`);
process.exit(0);
