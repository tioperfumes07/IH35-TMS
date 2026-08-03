#!/usr/bin/env node
/**
 * GUARD: new/changed Fastify auth routes must set config.rateLimit (CodeQL js/missing-rate-limiting).
 *
 * Cursor thrash class (2026-08-03 #4198): PR opened → CodeQL high → force-push → babysit.
 * Claude-parity: catch this BEFORE push via money-pr-local-gate (Rule 29).
 *
 * Scope: apps/backend/src route files (*.routes.ts / *.route.ts) changed vs origin/main (or MERGE_BASE).
 * For each route registration that intersects the diff and performs authorization
 * (requireAuth / currentAuthUser / requireDriverSession / requireAuthUser), require
 * rateLimit in the registration options.
 *
 * Usage:
 *   node scripts/verify-new-auth-routes-rate-limited.mjs
 *   MERGE_BASE=origin/main node scripts/verify-new-auth-routes-rate-limited.mjs
 *   node scripts/verify-new-auth-routes-rate-limited.mjs --selftest
 */
import { execSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-new-auth-routes-rate-limited";
const SELFTEST = process.argv.includes("--selftest");
const BASE = process.env.MERGE_BASE || "origin/main";

const AUTH_RE = /\b(requireAuth|currentAuthUser|requireDriverSession|requireAuthUser)\b/;
const RATE_RE = /\brateLimit\s*:/;
const METHOD_RE = /\bapp\.(get|post|put|patch|delete)\s*\(/g;

function sh(cmd) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 });
  } catch (e) {
    return e.stdout ? String(e.stdout) : "";
  }
}

/** Parse unified diff into Map<file, Set<addedLineNumber>> (new-file line numbers). */
export function parseAddedLines(diffText) {
  const map = new Map();
  let file = null;
  let newLine = 0;
  for (const raw of diffText.split("\n")) {
    if (raw.startsWith("+++ b/")) {
      file = raw.slice(6).trim();
      if (!map.has(file)) map.set(file, new Set());
      continue;
    }
    if (!file) continue;
    const hunk = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(raw);
    if (hunk) {
      newLine = Number(hunk[1]);
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      map.get(file)?.add(newLine);
      newLine += 1;
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      // deleted — do not advance newLine
    } else if (raw.startsWith("\\")) {
      // "\ No newline"
    } else {
      // context
      newLine += 1;
    }
  }
  return map;
}

/**
 * Find Fastify route registrations. Returns { method, startLine, endLine, head } where
 * head is the text from app.METHOD( through the options object / first arg after path
 * (enough to see rateLimit) plus ~400 chars of the handler for auth calls.
 */
export function findRouteRegistrations(src) {
  const lines = src.split("\n");
  // Build offset → line map
  const lineAt = (idx) => {
    let n = 1;
    for (let i = 0; i < idx && i < src.length; i++) if (src[i] === "\n") n++;
    return n;
  };
  const out = [];
  let m;
  const re = new RegExp(METHOD_RE.source, "g");
  while ((m = re.exec(src)) !== null) {
    const start = m.index;
    // Scan forward with paren depth to end of app.METHOD( ... ) call
    let i = src.indexOf("(", start);
    if (i < 0) continue;
    let depth = 0;
    let end = -1;
    for (; i < src.length; i++) {
      const ch = src[i];
      if (ch === "(") depth++;
      else if (ch === ")") {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    if (end < 0) continue;
    const slice = src.slice(start, Math.min(end + 400, src.length));
    const startLine = lineAt(start);
    const endLine = lineAt(end - 1);
    out.push({
      method: m[1],
      startLine,
      endLine,
      head: slice,
    });
  }
  return out;
}

export function findUnlimitedAuthRoutes(src, addedLines /* Set<number>|null */) {
  const problems = [];
  for (const reg of findRouteRegistrations(src)) {
    if (addedLines && addedLines.size) {
      let hits = false;
      for (let ln = reg.startLine; ln <= reg.endLine; ln++) {
        if (addedLines.has(ln)) {
          hits = true;
          break;
        }
      }
      // Also count auth call just after registration (handler body) within +15 lines
      if (!hits) {
        for (let ln = reg.endLine; ln <= reg.endLine + 15; ln++) {
          if (addedLines.has(ln)) {
            hits = true;
            break;
          }
        }
      }
      if (!hits) continue;
    }
    if (!AUTH_RE.test(reg.head)) continue;
    if (RATE_RE.test(reg.head)) continue;
    problems.push(
      `L${reg.startLine}: app.${reg.method}(…) authorizes but has no rateLimit config (CodeQL js/missing-rate-limiting)`,
    );
  }
  return problems;
}

if (SELFTEST) {
  const good = `
app.get("/ok", { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } }, async (req, reply) => {
  if (!requireAuth(req, reply)) return;
});
`;
  const bad = `
app.get("/bad", async (req, reply) => {
  const user = currentAuthUser(req, reply);
});
`;
  if (findUnlimitedAuthRoutes(good, null).length) {
    console.error("SELFTEST FAIL: good flagged");
    process.exit(1);
  }
  if (!findUnlimitedAuthRoutes(bad, null).length) {
    console.error("SELFTEST FAIL: bad not flagged");
    process.exit(1);
  }
  const diff = `+++ b/apps/backend/src/x.routes.ts
@@ -1,0 +1,4 @@
+app.get("/bad", async (req, reply) => {
+  const user = currentAuthUser(req, reply);
+});
`;
  const added = parseAddedLines(diff).get("apps/backend/src/x.routes.ts");
  if (!added || added.size < 2) {
    console.error("SELFTEST FAIL: parseAddedLines", added);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS`);
  process.exit(0);
}

// Resolve base — if origin/main missing, skip soft (local-only clone)
const baseCheck = sh(`git rev-parse --verify ${BASE}`);
if (!baseCheck.trim()) {
  console.log(`${LABEL}: SKIP — ${BASE} not available`);
  process.exit(0);
}

const nameOnly = sh(`git diff --name-only ${BASE}...HEAD -- 'apps/backend/src/**/*.routes.ts' 'apps/backend/src/**/*.route.ts'`)
  .split("\n")
  .map((s) => s.trim())
  .filter(Boolean);

if (!nameOnly.length) {
  console.log(`${LABEL}: OK — no backend route files changed vs ${BASE}`);
  process.exit(0);
}

const diffText = sh(
  `git diff ${BASE}...HEAD --unified=0 -- 'apps/backend/src/**/*.routes.ts' 'apps/backend/src/**/*.route.ts'`,
);
const addedMap = parseAddedLines(diffText);
const failures = [];

for (const rel of nameOnly) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) continue;
  const src = fs.readFileSync(abs, "utf8");
  const added = addedMap.get(rel) || new Set();
  const probs = findUnlimitedAuthRoutes(src, added.size ? added : null);
  for (const p of probs) failures.push(`${rel}: ${p}`);
}

if (failures.length) {
  console.error(`${LABEL} FAIL — auth route(s) missing rateLimit (will trip CodeQL on the PR):\n`);
  for (const f of failures) console.error(`  - ${f}`);
  console.error(
    `\nFix: add { config: { rateLimit: { max: 60, timeWindow: "1 minute" } } } as the 2nd arg to app.get/post/…\n` +
      `Then re-run: node scripts/money-pr-local-gate.mjs\n`,
  );
  process.exit(1);
}

console.log(`${LABEL}: OK — ${nameOnly.length} changed route file(s); auth registrations rate-limited`);
process.exit(0);
