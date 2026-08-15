#!/usr/bin/env node
/** CLS-BOX-IN-BOX vertical guard for the shared staged list-filter toolbar. */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const FRONTEND = path.join(ROOT, "apps/frontend/src");
const TARGET = "apps/frontend/src/components/table/CollapsedListFilters.tsx";
const POLICY = "apps/frontend/src/lib/single-frame-classname.ts";

function filesUnder(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (["__tests__", "test", "tests"].includes(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...filesUnder(full));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)) out.push(full);
  }
  return out;
}

function verify(source, policySource, files) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };
  require(source.includes('singleFrameLayoutClassName(className)'), "toolbar must sanitize outer-wrapper className");
  require(source.includes('className={`relative ${layoutClassName ?? ""}`}'), "toolbar root must receive layout-only classes");
  require(!source.includes('className={`relative ${className}`}'), "raw caller className still reaches toolbar root");
  require(policySource.includes("const OUTER_FRAME_TOKEN"), "shared outer-frame policy missing");
  for (const token of ["border(?:-.+)?", "rounded(?:-.+)?", "bg-.+", "ring(?:-.+)?", "shadow(?:-.+)?"]) {
    require(policySource.includes(token), `shared policy missing ${token}`);
  }

  const callSites = files.filter((file) => file !== path.join(ROOT, TARGET) && fs.readFileSync(file, "utf8").includes("<CollapsedListFilters"));
  require(callSites.length >= 50, `production host inventory unexpectedly shrank to ${callSites.length}`);
  require(callSites.some((file) => file.endsWith("pages/insurance/PoliciesList.tsx")), "proved outer-frame trigger host absent");
  const areas = new Set(callSites.map((file) => {
    const parts = path.relative(FRONTEND, file).split(path.sep);
    return `${parts[0]}/${parts[1] ?? "root"}`;
  }));
  require(areas.size >= 20, `vertical host inventory unexpectedly narrowed to ${areas.size} source areas`);
  return { errors, hosts: callSites.length, areas: areas.size };
}

function fail(message) {
  console.error(`verify-collapsed-list-filters-single-frame-vertical FAIL: ${message}`);
  process.exitCode = 1;
}

const source = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const policySource = fs.readFileSync(path.join(ROOT, POLICY), "utf8");
const files = filesUnder(FRONTEND);
const normal = verify(source, policySource, files);
normal.errors.forEach(fail);

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["raw wrapper class", source.replace('className={`relative ${layoutClassName ?? ""}`}', 'className={`relative ${className}`}'), policySource, files],
    ["border policy removed", source, policySource.replace("border(?:-.+)?|", ""), files],
    ["trigger host removed", source, policySource, files.filter((file) => !file.endsWith("pages/insurance/PoliciesList.tsx"))],
  ];
  for (const [name, mutatedSource, mutatedPolicy, mutatedFiles] of mutations) {
    if (verify(mutatedSource, mutatedPolicy, mutatedFiles).errors.length === 0) fail(`planted defect survived: ${name}`);
  }
}

if (!process.exitCode) console.log(`verify-collapsed-list-filters-single-frame-vertical PASS — ${normal.hosts} production hosts across ${normal.areas} source areas inherit one flat staged-filter toolbar`);
