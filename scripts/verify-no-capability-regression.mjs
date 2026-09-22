#!/usr/bin/env node
// verify-no-capability-regression.mjs — backstop for docs/manuals/capability-registry.json.
//
// Every registry entry names a proven engine by symbol, file and line. This guard fails when:
//   MISSING    the file is gone, or the symbol is no longer declared in it;
//   MOVED      the symbol is declared in some other file instead of the registered one;
//   DUPLICATE  the symbol is DEFINED in more than one non-test file under apps/backend/src — the
//              "second importer / second reversal engine" the registry exists to stop.
// A symbol that only drifted to a new line in the SAME file is reported as a warning with its
// current line (line numbers shift on every unrelated edit; failing on them would be noise).
// Retiring a capability means deleting its registry entry in the same PR, never deleting the code
// silently.
//
// Static, no DATABASE_URL: a source-text scan that never reads money data.
// CAPABILITY_REGISTRY_PATH overrides the registry location (used for the red run only).
export const ALLOW_OFFLINE_SKIP =
  "pure static source-text scan of capability-registry.json against apps/backend/src — never " +
  "connects to a database, so there is nothing to silently skip.";
import fs from "node:fs";
import path from "node:path";

const LABEL = "verify-no-capability-regression";
const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), "..");
const REGISTRY =
  process.env.CAPABILITY_REGISTRY_PATH || path.join(ROOT, "docs/manuals/capability-registry.json");
const SRC_DIR = path.join(ROOT, "apps/backend/src");

const fail = (msg) => {
  console.error(`[${LABEL}] FAIL: ${msg}`);
  process.exit(1);
};

function listSourceFiles(dir) {
  const out = [];
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "node_modules" || ent.name === "__tests__") continue;
      out.push(...listSourceFiles(p));
    } else if (/\.(ts|mts|js|mjs)$/.test(ent.name) && !/\.(test|spec)\.[mc]?[tj]s$/.test(ent.name)) {
      out.push(p);
    }
  }
  return out;
}

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// 1-based line numbers where `symbol` is DEFINED (not imported, not re-exported).
function definitionLines(text, symbol) {
  const s = escape(symbol);
  const re = new RegExp(
    `^\\s*(?:export\\s+)?(?:default\\s+)?(?:async\\s+)?` +
      `(?:function\\s*\\*?\\s*${s}\\s*[<(]|(?:const|let|var)\\s+${s}\\s*[:=]|class\\s+${s}\\b)`,
  );
  const lines = [];
  text.split("\n").forEach((line, i) => {
    if (re.test(line)) lines.push(i + 1);
  });
  return lines;
}

if (!fs.existsSync(REGISTRY)) fail(`registry not found at ${path.relative(ROOT, REGISTRY)}`);
let registry;
try {
  registry = JSON.parse(fs.readFileSync(REGISTRY, "utf8"));
} catch (e) {
  fail(`registry is not valid JSON: ${e.message}`);
}
const caps = Array.isArray(registry.capabilities) ? registry.capabilities : [];
if (caps.length === 0) fail("registry lists zero capabilities — refusing to pass on an empty registry");

const sourceFiles = listSourceFiles(SRC_DIR);
const sourceText = new Map(sourceFiles.map((f) => [f, fs.readFileSync(f, "utf8")]));

const errors = [];
const warnings = [];
for (const cap of caps) {
  const tag = `${cap.id} ${cap.symbol}`;
  if (!cap.symbol || !cap.file) {
    errors.push(`${tag}: registry entry is missing symbol or file`);
    continue;
  }
  const abs = path.join(ROOT, cap.file);
  const definedIn = [...sourceText]
    .map(([f, text]) => [f, definitionLines(text, cap.symbol)])
    .filter(([, lines]) => lines.length > 0);

  if (definedIn.length > 1) {
    errors.push(
      `${tag}: DUPLICATE — defined in ${definedIn.length} files: ` +
        definedIn.map(([f, l]) => `${path.relative(ROOT, f)}:${l.join(",")}`).join(" ; "),
    );
  }
  if (!fs.existsSync(abs)) {
    errors.push(`${tag}: MISSING — registered file ${cap.file} does not exist`);
    continue;
  }
  const here = definedIn.find(([f]) => f === abs);
  if (!here) {
    if (definedIn.length > 0) {
      errors.push(
        `${tag}: MOVED — no longer defined in ${cap.file}; now in ` +
          definedIn.map(([f, l]) => `${path.relative(ROOT, f)}:${l[0]}`).join(" ; "),
      );
    } else {
      errors.push(`${tag}: MISSING — not defined in ${cap.file} or anywhere under apps/backend/src`);
    }
    continue;
  }
  if (cap.line && !here[1].includes(Number(cap.line))) {
    warnings.push(`${tag}: line drift ${cap.file}:${cap.line} -> now :${here[1].join(",")} (refresh the registry)`);
  }
}

for (const w of warnings) console.warn(`[${LABEL}] WARN: ${w}`);
if (errors.length > 0) {
  fail(`${errors.length} capability regression(s):\n  - ${errors.join("\n  - ")}`);
}
console.log(`[${LABEL}] OK: ${caps.length} capabilities present, each defined exactly once (${warnings.length} line-drift warning(s)).`);
