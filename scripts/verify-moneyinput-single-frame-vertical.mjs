#!/usr/bin/env node
/**
 * CLS-BOX-IN-BOX-MONEYINPUT-OUTER-FRAME vertical class guard.
 *
 * MoneyInput's <input> already owns its full visual frame (hardcoded border/rounded/etc.). The
 * outer positioning wrapper forwarded the caller's className verbatim, so any caller supplying
 * border/rounded/bg/ring/shadow tokens (intending to style the money field) painted a SECOND box
 * around an already-bordered input — the same box-within-box class already fixed for
 * SelectCombobox (verify-selectcombobox-single-frame-vertical.mjs) and CollapsedListFilters
 * (verify-collapsed-list-filters-single-frame-vertical.mjs). This guard proves the shared adapter
 * strips the outer frame and inventories every production call-site file, so the class is not
 * reduced to the two callers where it was first observed (DisputeQueuePage.tsx,
 * EscrowForfeitModal.tsx).
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
const TARGET = "apps/frontend/src/components/forms/MoneyInput.tsx";
const POLICY = "apps/frontend/src/lib/single-frame-classname.ts";
const FRONTEND = path.join(ROOT, "apps/frontend/src");

function fail(message) {
  console.error(`verify-moneyinput-single-frame-vertical FAIL: ${message}`);
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
  const require_ = (condition, message) => { if (!condition) errors.push(message); };

  require_(policySource.includes("const OUTER_FRAME_TOKEN"), "missing centralized legacy-frame token policy");
  for (const token of ["border(?:-.+)?", "rounded(?:-.+)?", "bg-.+", "ring(?:-.+)?", "shadow(?:-.+)?"]) {
    require_(policySource.includes(token), `frame policy must cover exact token pattern ${token}`);
  }
  require_(source.includes("singleFrameLayoutClassName(className)"), "MoneyInput must sanitize caller className");
  require_(
    source.includes('className={`relative ${layoutClassName ?? ""}`}'),
    "outer positioning wrapper must render sanitized layoutClassName only"
  );
  require_(
    !/className=\{`relative \$\{className\}`\}/.test(source),
    "raw caller className still reaches the outer wrapper"
  );
  // The <input> itself keeps its own hardcoded frame — this guard is about the OUTER wrapper only.
  require_(
    /className="h-7 w-full rounded-sm border border-gray-300/.test(source),
    "MoneyInput's own <input> frame must stay intact — this guard governs the outer wrapper, not the control"
  );

  const callSites = files.filter(
    (file) => file !== path.join(ROOT, TARGET) && fs.readFileSync(file, "utf8").includes("<MoneyInput")
  );
  require_(callSites.length >= 75, `production call-site inventory unexpectedly shrank to ${callSites.length}`);
  require_(
    callSites.some((file) => file.endsWith("pages/accounting/DisputeQueuePage.tsx")),
    "trigger caller DisputeQueuePage is absent from inventory"
  );
  require_(
    callSites.some((file) => file.endsWith("pages/safety/components/EscrowForfeitModal.tsx")),
    "trigger caller EscrowForfeitModal is absent from inventory"
  );

  const representedAreas = new Set(
    callSites.map((file) => {
      const relative = path.relative(FRONTEND, file).split(path.sep);
      return relative[0] === "pages" || relative[0] === "components" ? `${relative[0]}/${relative[1] ?? "root"}` : relative[0];
    })
  );
  require_(representedAreas.size >= 15, `vertical surface inventory unexpectedly narrowed to ${representedAreas.size} source areas`);

  return { errors, callSites: callSites.length, representedAreas: representedAreas.size };
}

const source = fs.readFileSync(path.join(ROOT, TARGET), "utf8");
const policySource = fs.readFileSync(path.join(ROOT, POLICY), "utf8");
const files = productionFiles(FRONTEND);
const normal = verify(source, policySource, files);
for (const error of normal.errors) fail(error);

if (process.argv.includes("--selftest")) {
  const mutations = [
    [
      "raw className bypass",
      source.replace('className={`relative ${layoutClassName ?? ""}`}', 'className={`relative ${className}`}'),
      policySource,
    ],
    ["border policy removed", source, policySource.replace("border(?:-.+)?|", "")],
    [
      "trigger caller removed",
      source,
      policySource,
      files.filter((file) => !file.endsWith("pages/accounting/DisputeQueuePage.tsx")),
    ],
    [
      "input's own frame silently dropped",
      source.replace(
        'className="h-7 w-full rounded-sm border border-gray-300 pl-4 pr-2 text-left text-xs"',
        'className="h-7 w-full pl-4 pr-2 text-left text-xs"'
      ),
      policySource,
    ],
  ];
  for (const [name, mutated, mutatedPolicy, mutatedFiles = files] of mutations) {
    if (verify(mutated, mutatedPolicy, mutatedFiles).errors.length === 0) fail(`planted defect survived: ${name}`);
  }
}

if (!process.exitCode) {
  console.log(
    `verify-moneyinput-single-frame-vertical PASS — ${normal.callSites} production call-site files across ${normal.representedAreas} source areas inherit one canonical MoneyInput frame`
  );
}
