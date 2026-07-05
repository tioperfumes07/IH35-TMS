#!/usr/bin/env node
/**
 * verify-g2-1-log-event-parameterized.mjs
 *
 * G2-1 (Security/Audit, CRITICAL) regression guard.
 *
 * A real SQL-injection existed in apps/backend/src/alerts/alert.routes.ts: an unvalidated
 * operating_company_id ("ocId") pulled raw off request.body was STRING-INTERPOLATED into an
 * `events.log_event(...)` audit-spine call (`'${ocId}'`). Fix = (1) uuid-validate the id at the
 * schema edge and (2) bind every caller-supplied value as a $n placeholder.
 *
 * This guard fails if ANY backend `events.log_event(` call is written as a template literal whose
 * SQL text contains `${...}` interpolation (parameterized calls carry `${}` only in the params
 * array — the SQL string itself must be interpolation-free). It also pins the specific fixes in
 * alert.routes.ts so the CRITICAL finding cannot silently regress.
 */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const ROOT = process.cwd();
let failed = false;
function fail(msg) { console.error(`[verify-g2-1] FAIL: ${msg}`); failed = true; }
function pass(msg) { console.log(`[verify-g2-1] PASS: ${msg}`); }

function read(rel) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) { fail(`missing file: ${rel}`); return null; }
  return fs.readFileSync(abs, "utf8");
}

// Recursively collect backend .ts source files (skip tests, dist, node_modules).
function collectTs(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "__tests__", "build"].includes(entry.name)) continue;
      collectTs(full, out);
    } else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts")) {
      out.push(full);
    }
  }
  return out;
}

// Extract backtick-delimited template literals from a source string (non-nested; good enough for SQL).
function templateLiterals(src) {
  const out = [];
  let i = 0;
  while (i < src.length) {
    if (src[i] === "`") {
      let j = i + 1;
      let buf = "";
      while (j < src.length && src[j] !== "`") {
        if (src[j] === "\\") { buf += src[j] + (src[j + 1] ?? ""); j += 2; continue; }
        buf += src[j];
        j++;
      }
      out.push(buf);
      i = j + 1;
    } else {
      i++;
    }
  }
  return out;
}

// 1. Codebase-wide: no events.log_event SQL string may contain ${...} interpolation.
const backendSrc = path.join(ROOT, "apps/backend/src");
if (!fs.existsSync(backendSrc)) { fail("apps/backend/src not found"); }
else {
  const files = collectTs(backendSrc, []);
  let scanned = 0;
  let offenders = 0;
  for (const abs of files) {
    const src = fs.readFileSync(abs, "utf8");
    if (!src.includes("events.log_event")) continue;
    scanned++;
    for (const tl of templateLiterals(src)) {
      if (tl.includes("events.log_event") && /\$\{/.test(tl)) {
        fail(`${path.relative(ROOT, abs)}: events.log_event SQL uses \${...} interpolation — bind as $n instead`);
        offenders++;
      }
    }
  }
  if (offenders === 0) pass(`no interpolated events.log_event SQL across ${scanned} backend file(s)`);
}

// 2. Pin the specific G2-1 fix in alert.routes.ts.
const alertRel = "apps/backend/src/alerts/alert.routes.ts";
const alert = read(alertRel);
if (alert) {
  // 2a. The old injectable literal must be gone.
  if (alert.includes("'${ocId}'")) fail("alert.routes.ts still string-interpolates '${ocId}' into SQL");
  else pass("alert.routes.ts no longer interpolates ocId into SQL");

  // 2b. QueueDecisionSchema must uuid-validate operating_company_id.
  const schemaMatch = alert.match(/const\s+QueueDecisionSchema\s*=\s*z\.object\(\{([\s\S]*?)\}\)/);
  if (!schemaMatch) fail("QueueDecisionSchema not found");
  else if (!/operating_company_id\s*:\s*z\.string\(\)\.uuid\(\)/.test(schemaMatch[1])) {
    fail("QueueDecisionSchema does not uuid-validate operating_company_id");
  } else pass("QueueDecisionSchema uuid-validates operating_company_id");

  // 2c. The decide route (the G2-1 injection sink) must derive ocId from the validated schema,
  // not a raw request.body cast. Scope the check to the decide route block only — sibling config
  // routes bind ocId as a parameter (not injectable) and are outside this finding.
  const decideStart = alert.indexOf('"/broker-queue/:id/decide"');
  const decideBlock = decideStart === -1 ? "" : alert.slice(decideStart);
  if (decideStart === -1) fail("decide route (/broker-queue/:id/decide) not found");
  else if (/const\s+ocId\s*=\s*\(request\.body\s+as/.test(decideBlock)) {
    fail("decide route still reads ocId via a raw (request.body as ...) cast");
  } else if (!/const\s+ocId\s*=\s*input\.operating_company_id/.test(decideBlock)) {
    fail("decide route does not derive ocId from the uuid-validated schema (input.operating_company_id)");
  } else pass("decide route derives ocId from the uuid-validated schema");

  // 2d. The log_event call must be parameterized.
  if (!/events\.log_event\(\$1,/.test(alert)) fail("alert.routes.ts events.log_event is not parameterized ($1...)");
  else pass("alert.routes.ts events.log_event is parameterized");
}

if (failed) { console.error("\n[verify-g2-1] FAILED"); process.exit(1); }
console.log("\n[verify-g2-1] ALL CHECKS PASSED");
