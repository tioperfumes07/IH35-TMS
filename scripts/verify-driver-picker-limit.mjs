#!/usr/bin/env node
/**
 * verify-driver-picker-limit.mjs
 *
 * CI guard for audit finding B2-2 (driver-picker 50-cap landmine).
 *
 * The frontend `listDrivers(...)` helper (apps/frontend/src/api/mdata.ts) hits
 * GET /api/v1/mdata/drivers, which defaults to `limit=50` (ORDER BY created_at DESC).
 * Any driver picker / roster fetch that omits an explicit `limit` therefore silently
 * drops every active driver past the newest 50 — a real driver ("Mecor") once vanished
 * from Book Load this way.
 *
 * Rule enforced here: EVERY non-test call to `listDrivers({ ... })` in apps/frontend/src
 * must pass an explicit `limit` in its argument object (pickers use 200/500; the paged
 * roster passes `limit: pageSize`). The `DriverAutocomplete` component is compliant because
 * it declares a `limit?` prop and forwards it while driving a server-side `search` query.
 *
 * Fails (exit 1) listing every offending call site if any picker regresses to the default.
 */
import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SRC_DIR = path.join(ROOT, "apps/frontend/src");

// The definition file itself declares `limit?: number` in the params type — not a call site.
const DEFINITION_FILE = path.join(SRC_DIR, "api/mdata.ts");

const errors = [];

/** Recursively collect .ts/.tsx source files, skipping tests. */
function collect(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const abs = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "__tests__" || entry.name === "node_modules") continue;
      out.push(...collect(abs));
    } else if (/\.(ts|tsx)$/.test(entry.name) && !/\.(test|spec)\.(ts|tsx)$/.test(entry.name)) {
      out.push(abs);
    }
  }
  return out;
}

/**
 * Given source text and the index just AFTER `listDrivers(`, return the argument
 * substring up to the matching close paren (paren-balanced so multi-line calls work).
 */
function extractArgs(src, startIdx) {
  let depth = 1;
  let i = startIdx;
  for (; i < src.length && depth > 0; i++) {
    const ch = src[i];
    if (ch === "(") depth++;
    else if (ch === ")") depth--;
  }
  return src.slice(startIdx, i - 1);
}

const CALL_RE = /listDrivers\s*\(/g;

for (const abs of collect(SRC_DIR)) {
  if (abs === DEFINITION_FILE) continue;
  const src = fs.readFileSync(abs, "utf8");
  const rel = path.relative(ROOT, abs);
  let m;
  CALL_RE.lastIndex = 0;
  while ((m = CALL_RE.exec(src)) !== null) {
    const args = extractArgs(src, CALL_RE.lastIndex);
    // Only enforce real object-literal call sites `listDrivers({ ... })`. This skips prose in doc
    // comments (e.g. "listDrivers (mdata.drivers ...)") and any rare variable-arg forwarding.
    if (!args.trimStart().startsWith("{")) continue;
    // `limit` may appear as `limit:` or `limit }` (shorthand forward, e.g. DriverAutocomplete).
    if (!/\blimit\b/.test(args)) {
      const line = src.slice(0, m.index).split("\n").length;
      errors.push(
        `${rel}:${line} — listDrivers(...) call has no explicit \`limit\`. The endpoint ` +
          `defaults to 50 and silently drops active drivers past the newest 50 (finding B2-2). ` +
          `Pass \`limit: 200\` (or a paged \`limit\`).`
      );
    }
  }
}

if (errors.length > 0) {
  console.error("verify-driver-picker-limit: FAIL — driver-picker 50-cap regression(s):\n");
  for (const e of errors) console.error("  - " + e);
  console.error(`\n${errors.length} offending call site(s).`);
  process.exit(1);
}

console.log("verify-driver-picker-limit: PASS — every listDrivers(...) call passes an explicit limit.");
