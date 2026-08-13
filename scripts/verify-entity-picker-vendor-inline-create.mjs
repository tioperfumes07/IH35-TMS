#!/usr/bin/env node
/** @matrix-built {"modules":["accounting","fuel","maintenance"],"cols":["vendor","connectivity","picker_law"],"task":"VENDOR-ENTITY-PICKER-INLINE-CREATE-VERTICAL","leafRe":".*vendor.*(create|filter).*"} */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SELFTEST = process.argv.includes("--selftest");
const ENTITY_PICKER = "apps/frontend/src/components/parity/EntityPicker.tsx";
const REGISTRY = "apps/frontend/src/components/parity/entityPickerRegistry.ts";
const SOURCE_ROOT = "apps/frontend/src";

function stripComments(source) {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*$/gm, "");
}

function vendorPickerTags(files) {
  const tags = [];
  for (const [file, source] of Object.entries(files)) {
    for (const match of stripComments(source).matchAll(/<EntityPicker\b[\s\S]*?\/>/g)) {
      if (/kind=["']vendor["']/.test(match[0])) tags.push({ file, tag: match[0] });
    }
  }
  return tags;
}

export function collectProblems({ picker, registry, files }) {
  const problems = [];
  const cleanPicker = stripComments(picker);
  const cleanRegistry = stripComments(registry);
  const vendorEntry = cleanRegistry.match(/vendor:\s*\{[\s\S]*?\n\s*\},\n\n\s*work_order:/)?.[0] ?? "";

  if (!/inlineCreate:\s*\{\s*available:\s*true\s*\}/.test(vendorEntry)) {
    problems.push("registry vendor kind must offer canonical inline create");
  }
  if (!/kind === ["']vendor["'][\s\S]{0,300}<InlineCreateDrawer/.test(cleanPicker)) {
    problems.push("EntityPicker vendor kind must delegate to InlineCreateDrawer");
  }
  if (!/onCreated=\{\(record\) => handleCreated\(record\.id, record\.label\)\}/.test(cleanPicker)) {
    problems.push("vendor create must return canonical id+label through EntityPicker selection");
  }

  const tags = vendorPickerTags(files);
  if (tags.length === 0) problems.push("no vendor EntityPicker leaves found");
  for (const { file, tag } of tags) {
    if (!/allowCreate(?:\s|=)/.test(tag)) {
      problems.push(`${file}: vendor EntityPicker must explicitly classify create versus filter`);
    }
  }

  const fuel = tags.find(({ file }) => file.endsWith("CreateFuelTransactionModal.tsx"));
  if (!fuel || /allowCreate=\{false\}/.test(fuel.tag)) {
    problems.push("fuel create vendor picker must offer + Create");
  }
  for (const filterFile of ["BillPaymentsListPage.tsx", "WorkOrdersTable.tsx"]) {
    const filter = tags.find(({ file }) => file.endsWith(filterFile));
    if (!filter || !/allowCreate=\{false\}/.test(filter.tag)) {
      problems.push(`${filterFile}: list filter must not create vendor master data`);
    }
  }
  return problems;
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function liveSources() {
  const files = {};
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name.endsWith(".tsx") && !/\.(?:test|spec)\.tsx$/.test(entry.name)) {
        files[path.relative(ROOT, full)] = fs.readFileSync(full, "utf8");
      }
    }
  };
  walk(path.join(ROOT, SOURCE_ROOT));
  return { picker: read(ENTITY_PICKER), registry: read(REGISTRY), files };
}

const sources = liveSources();
if (SELFTEST) {
  const mutations = [
    {
      ...sources,
      registry: sources.registry.replace(
        /(vendor:\s*\{[\s\S]*?)inlineCreate:\s*\{\s*available:\s*true\s*\}/,
        "$1inlineCreate: { available: false }",
      ),
    },
    { ...sources, picker: sources.picker.replace('kind === "vendor"', 'kind === "vendor_disabled"') },
    { ...sources, picker: sources.picker.replace("handleCreated(record.id, record.label)", "handleCreated(record.label)") },
    { ...sources, files: Object.fromEntries(Object.entries(sources.files).map(([file, source]) => [file, file.endsWith("CreateFuelTransactionModal.tsx") ? source.replace("allowCreate\n", "") : source])) },
    { ...sources, files: Object.fromEntries(Object.entries(sources.files).map(([file, source]) => [file, file.endsWith("WorkOrdersTable.tsx") ? source.replace("allowCreate={false}\n", "") : source])) },
  ];
  const escaped = mutations
    .map((mutation, index) => ({ index: index + 1, problems: collectProblems(mutation) }))
    .filter(({ problems }) => problems.length === 0);
  if (escaped.length) {
    console.error(`verify-entity-picker-vendor-inline-create SELFTEST FAIL — mutation(s) ${escaped.map(({ index }) => index).join(", ")} escaped`);
    process.exit(1);
  }
}

const problems = collectProblems(sources);
if (problems.length) {
  console.error("verify-entity-picker-vendor-inline-create FAIL");
  for (const problem of problems) console.error(`  - ${problem}`);
  process.exit(1);
}
console.log(`verify-entity-picker-vendor-inline-create PASS — ${vendorPickerTags(sources.files).length} vendor picker leaves classified${SELFTEST ? "; 5 mutations caught" : ""}`);
