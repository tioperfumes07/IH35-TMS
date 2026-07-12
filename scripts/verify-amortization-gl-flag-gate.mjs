#!/usr/bin/env node
/**
 * Wave-3 flag-gate guard — AMORTIZATION_GL_POSTING_ENABLED (FIN-21 prepaid-amortization +
 * fixed-asset-depreciation GL poster). Locks two invariants so the posting money-flag can advance to
 * verify-then-flip without regressing (CLAUDE.md §2: every fix gets a static CI guard):
 *
 *   (1) FLAG GATE (no unconditional posting): BOTH posters in amortization-posting.service.ts
 *       (postPrepaidAmortization + postDepreciation) resolve AMORTIZATION_GL_POSTING_FLAG_KEY via
 *       isEnabled() and RETURN the skipped_flag_off no-op BEFORE they write any journal entry
 *       (insertJournalEntryHeader) — with the flag OFF, zero JEs / financial rows are written.
 *   (2) DEFAULT OFF: the flag's seed migration (202606290060) registers
 *       AMORTIZATION_GL_POSTING_ENABLED in lib.feature_flags with default_enabled=false.
 *
 * Protected write: apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts
 *   — Dr expense / Cr prepaid asset (postPrepaidAmortization ~L267) and Dr depr-exp / Cr accum-depr
 *     (postDepreciation ~L491), both via insertJournalEntryHeader().
 *
 * Pure file-content checks — no DB. --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const MATH = "apps/backend/src/accounting/amortization-posting/amortization-posting.math.ts";
const SERVICE = "apps/backend/src/accounting/amortization-posting/amortization-posting.service.ts";
const MIGRATION = "db/migrations/202606290060_amortization_gl_posting_flag.sql";

/** strip TS comments so a describing comment can neither satisfy nor trip the checks. */
function stripCode(src) {
  return src.replace(/\/\/.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "");
}
/** strip SQL -- line comments (a comment naming the flag must not stand in for the seeded row). */
function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
/** slice one function body from its `function <name>` up to the next function declaration. */
function sliceFn(code, name) {
  const i = code.indexOf(`function ${name}`);
  if (i < 0) return "";
  const rest = code.slice(i + 9);
  const m = rest.search(/\n(export\s+)?(async\s+)?function\s+\w/);
  return m < 0 ? code.slice(i) : code.slice(i, i + 9 + m);
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,900}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

export function assertAmortization({ math, service, migration }) {
  const errors = [];
  if (!/AMORTIZATION_GL_POSTING_FLAG_KEY\s*=\s*["']AMORTIZATION_GL_POSTING_ENABLED["']/.test(math)) {
    errors.push("math: AMORTIZATION_GL_POSTING_FLAG_KEY const ('AMORTIZATION_GL_POSTING_ENABLED') missing");
  }
  const code = stripCode(service);
  for (const fn of ["postPrepaidAmortization", "postDepreciation"]) {
    const body = sliceFn(code, fn);
    if (!body) { errors.push(`service: ${fn}() not found`); continue; }
    const gate = body.search(/isEnabled\([^)]*AMORTIZATION_GL_POSTING_FLAG_KEY/);
    const skip = body.search(/skipped_flag_off/);
    const write = body.search(/insertJournalEntryHeader\s*\(/);
    if (gate < 0) errors.push(`service: ${fn}() does not gate on isEnabled(AMORTIZATION_GL_POSTING_FLAG_KEY)`);
    if (skip < 0) errors.push(`service: ${fn}() has no skipped_flag_off no-op return`);
    if (write < 0) errors.push(`service: ${fn}() never writes a JE via insertJournalEntryHeader (unexpected)`);
    if (gate >= 0 && write >= 0 && gate > write) errors.push(`service: ${fn}() flag gate must precede insertJournalEntryHeader (no unconditional posting)`);
    if (skip >= 0 && write >= 0 && skip > write) errors.push(`service: ${fn}() skipped_flag_off return must precede insertJournalEntryHeader`);
  }
  if (!seededDefaultOff(migration, "AMORTIZATION_GL_POSTING_ENABLED")) {
    errors.push("migration: AMORTIZATION_GL_POSTING_ENABLED not seeded with default_enabled=false (DEFAULT OFF)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const goodPoster = (fn) => `
export async function ${fn}(input, actor) {
  const flagOn = await isEnabled(client, AMORTIZATION_GL_POSTING_FLAG_KEY, { operating_company_id: x });
  if (!flagOn) return { result: "skipped_flag_off", posted_periods: [] };
  const je = await insertJournalEntryHeader(client, x, d, memo, actor.userId);
}`;
  const good = {
    math: `export const AMORTIZATION_GL_POSTING_FLAG_KEY = "AMORTIZATION_GL_POSTING_ENABLED";`,
    service: goodPoster("postPrepaidAmortization") + goodPoster("postDepreciation"),
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled, rollout_pct)\nVALUES ('AMORTIZATION_GL_POSTING_ENABLED', 'desc', false, 0);`,
  };
  const badPoster = (fn) => `
export async function ${fn}(input, actor) {
  const je = await insertJournalEntryHeader(client, x, d, memo, actor.userId);
  const flagOn = await isEnabled(client, AMORTIZATION_GL_POSTING_FLAG_KEY, {});
}`;
  const bad = {
    math: `export const OTHER = "x";`,
    service: badPoster("postPrepaidAmortization") + badPoster("postDepreciation"),
    migration: `INSERT INTO lib.feature_flags VALUES ('AMORTIZATION_GL_POSTING_ENABLED', 'desc', true);`,
  };
  const g = assertAmortization(good);
  const b = assertAmortization(bad);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 4) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  console.log("verify-amortization-gl-flag-gate selftest OK");
  process.exit(0);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`verify-amortization-gl-flag-gate FAIL — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const errors = assertAmortization({ math: read(MATH), service: read(SERVICE), migration: read(MIGRATION) });
if (errors.length) {
  console.error("verify-amortization-gl-flag-gate FAIL — AMORTIZATION_GL_POSTING_ENABLED gate broken:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-amortization-gl-flag-gate OK — both posters gate on isEnabled(flag) before any JE; flag seeded default OFF.");
