#!/usr/bin/env node
/**
 * CLS-BOX-IN-BOX vertical class guard.
 *
 * SelectCombobox is shared by Lists and the rest of the product. Legacy call sites pass native
 * select frame classes; the canonical Combobox already renders the only allowed control frame.
 * This guard proves the shared adapter strips the outer frame and inventories every production
 * call-site file, so the class is not reduced to the first Detail Type drawer where it was seen.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TARGET = "apps/frontend/src/components/shared/SelectCombobox.tsx";
const POLICY = "apps/frontend/src/lib/single-frame-classname.ts";
const FRONTEND = path.join(ROOT, "apps/frontend/src");

function fail(message) {
  console.error(`verify-selectcombobox-single-frame-vertical FAIL: ${message}`);
  process.exitCode = 1;
}

function productionFiles(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "__tests__" || entry.name === "test" || entry.name === "tests") continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...productionFiles(full));
    else if (/\.(?:ts|tsx)$/.test(entry.name) && !/\.(?:test|spec)\.[^.]+$/.test(entry.name)) out.push(full);
  }
  return out;
}

function verify(source, policySource, files) {
  const errors = [];
  const require = (condition, message) => { if (!condition) errors.push(message); };

  require(policySource.includes("const OUTER_FRAME_TOKEN"), "missing centralized legacy-frame token policy");
  for (const token of ["border(?:-.+)?", "rounded(?:-.+)?", "bg-.+", "ring(?:-.+)?", "shadow(?:-.+)?"]) {
    require(policySource.includes(token), `frame policy must cover exact token pattern ${token}`);
  }
  require(source.includes("singleFrameLayoutClassName(className)"), "adapter must sanitize caller className");
  require(source.includes("className={layoutClassName}"), "canonical Combobox must receive sanitized layout classes only");
  require(!source.includes("className={className}\n      />"), "raw caller className still reaches the outer Combobox wrapper");

  const callSites = files.filter((file) => file !== path.join(ROOT, TARGET) && fs.readFileSync(file, "utf8").includes("<SelectCombobox"));
  require(callSites.length >= 100, `production call-site inventory unexpectedly shrank to ${callSites.length}`);
  require(callSites.some((file) => file.endsWith("pages/lists/accounting/DetailTypesListPage.tsx")), "trigger leaf Detail Types create is absent from inventory");

  const representedAreas = new Set(callSites.map((file) => {
    const relative = path.relative(FRONTEND, file).split(path.sep);
    return relative[0] === "pages" || relative[0] === "components" ? `${relative[0]}/${relative[1] ?? "root"}` : relative[0];
  }));
  require(representedAreas.size >= 25, `vertical surface inventory unexpectedly narrowed to ${representedAreas.size} source areas`);
  return { errors, callSites: callSites.length, representedAreas: representedAreas.size };
}

const source = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const policySource = fs.readFileSync(path.join(ROOT, POLICY), "utf8");
const files = productionFiles(FRONTEND);
const normal = verify(source, policySource, files);
for (const error of normal.errors) fail(error);

if (process.argv.includes("--selftest")) {
  const mutations = [
    ["raw className bypass", source.replace("className={layoutClassName}", "className={className}"), policySource],
    ["border policy removed", source, policySource.replace("border(?:-.+)?|", "")],
    ["trigger leaf removed", source, policySource, files.filter((file) => !file.endsWith("pages/lists/accounting/DetailTypesListPage.tsx"))],
  ];
  for (const [name, mutated, mutatedPolicy, mutatedFiles = files] of mutations) {
    if (verify(mutated, mutatedPolicy, mutatedFiles).errors.length === 0) fail(`planted defect survived: ${name}`);
  }
}

if (!process.exitCode) {
  console.log(`verify-selectcombobox-single-frame-vertical PASS — ${normal.callSites} production call-site files across ${normal.representedAreas} source areas inherit one canonical Combobox frame`);
}
