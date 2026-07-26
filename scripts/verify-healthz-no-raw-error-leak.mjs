#!/usr/bin/env node
/**
 * SEC-HEALTHZ-01 — no raw driver/error text may reach an UNAUTHENTICATED health response.
 *
 * WHY THIS EXISTS
 * `GET /api/v1/healthz` answered a failed check with `String((error as Error)?.message ?? error)`
 * (apps/backend/src/health/health.routes.ts, pre-fix lines 42 and 121). That route is
 * unauthenticated — apps/backend/src/auth/session-middleware.ts returns from its preHandler for
 * every url starting `/api/v1/healthz`, so the body is world-readable on the public internet — and
 * the strings it published come straight out of the drivers:
 *
 *   pg       "password authentication failed for user \"ih35_app\"" ,
 *            "relation \"accounting.bills\" does not exist",
 *            "getaddrinfo ENOTFOUND ep-xxx.us-east-1.aws.neon.tech"
 *   ioredis  "connect ECONNREFUSED 10.0.0.5:6379"
 *   S3/R2    endpoint text carrying the Cloudflare account id
 *
 * i.e. host, port, database, DB role, schema and relation names, handed to anonymous callers.
 *
 * WHAT THIS GUARD ENFORCES (three arms, all fail-closed)
 *   1. DECLARED-CODE ONLY — every `error:` property in an unauthenticated health response must be
 *      a bounded, hand-written code: `toPublicHealthErrorCode(...)`, a `"[a-z0-9_]"` literal, or an
 *      ALL_CAPS constant. Anything else (String(), .message, .stack, a template literal, a bare
 *      error identifier, JSON.stringify) is a leak. This is an ALLOWLIST on purpose: a blocklist
 *      would pass the next driver we adopt.
 *   2. SANITIZER INTEGRITY — the sanitizer must exist, must fall back to a bounded generic literal,
 *      and must never itself read `.message` / `.stack`. A sanitizer that forwards the message is
 *      the same bug wearing a function name.
 *   3. NOT SWALLOWED — every catch block that publishes an `error:` code must also log the real
 *      error server-side. Sanitizing without logging trades an info-disclosure for blindness; the
 *      owner directive was explicitly "log the real error server-side".
 *
 * The set of files audited is DERIVED, not hardcoded: the auth-exempt url prefixes are read out of
 * session-middleware.ts, and every backend route file registering a route under one of those
 * prefixes is audited. A future unauthenticated health route is covered the day it is written. If
 * either derivation comes back empty the guard FAILS rather than passing vacuously.
 *
 * --selftest mutates the REAL source back into the pre-fix shape (plus three neighbouring defects)
 * and asserts every one is caught, that no mutation was inert, and that the real unmutated source
 * is clean.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps", "backend", "src");
const SESSION_MIDDLEWARE = path.join(BACKEND_SRC, "auth", "session-middleware.ts");
const LABEL = "verify-healthz-no-raw-error-leak";
const SELFTEST = process.argv.includes("--selftest");

const read = (p) => fs.readFileSync(p, "utf8");
const rel = (p) => path.relative(ROOT, p);

/** A code that may be published to an anonymous caller: our own literal, nothing interpolated. */
const BOUNDED_CODE_LITERAL = /^(["'])[a-z0-9_]{1,48}\1$/;
const ALLCAPS_CONST = /^[A-Z][A-Z0-9_]*$/;
const SANITIZER = "toPublicHealthErrorCode";

// ── derivation ────────────────────────────────────────────────────────────────────────────────

/** Url prefixes the session middleware lets through WITHOUT authenticating. */
export function unauthenticatedPrefixes(middlewareSource) {
  const prefixes = [];
  for (const m of middlewareSource.matchAll(/url\.startsWith\(\s*["'`]([^"'`]+)["'`]\s*\)/g)) {
    prefixes.push(m[1]);
  }
  return [...new Set(prefixes)];
}

function walkTs(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === "node_modules" || entry.name === "__tests__" || entry.name === "dist") continue;
      walkTs(full, out);
      continue;
    }
    if (!entry.name.endsWith(".ts") || entry.name.endsWith(".d.ts") || entry.name.includes(".test.")) continue;
    out.push(full);
  }
  return out;
}

/** Route files registering an HTTP route under one of the unauthenticated prefixes. */
export function routeFilesUnderPrefixes(files, prefixes) {
  const hits = [];
  for (const file of files) {
    const source = read(file);
    const registers = [...source.matchAll(/\bapp\.(get|post|put|patch|delete)\(\s*["'`]([^"'`]+)["'`]/g)];
    if (registers.some(([, , route]) => prefixes.some((p) => route.startsWith(p)))) hits.push(file);
  }
  return hits;
}

// ── audit ─────────────────────────────────────────────────────────────────────────────────────

/** Brace-balanced body starting at the `{` at or after `from`. */
function balancedBlock(source, from) {
  const open = source.indexOf("{", from);
  if (open === -1) return "";
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === "{") depth++;
    else if (source[i] === "}") {
      depth--;
      if (depth === 0) return source.slice(open, i + 1);
    }
  }
  return source.slice(open);
}

/**
 * `error:` OBJECT-PROPERTY value expressions — i.e. the thing that actually lands in the response
 * body. Deliberately excludes:
 *   - `error?: string` — the type declaration (the `?` means the regex never matches it),
 *   - `function f(..., error: unknown)` — a parameter type annotation, detected by an unclosed `(`
 *     to the left with no object literal opened inside it,
 *   - comment lines.
 */
export function errorPropertyValues(source) {
  const found = [];
  source.split("\n").forEach((line, i) => {
    const trimmed = line.trim();
    if (trimmed.startsWith("*") || trimmed.startsWith("//")) return;
    for (const m of line.matchAll(/(?:^|[\s{,(])error:\s*([^,}\n]+)/g)) {
      const prefix = line.slice(0, m.index + m[0].indexOf("error:"));
      const count = (ch) => prefix.split(ch).length - 1;
      const inParamList = count("(") > count(")") && count("{") <= count("}");
      if (inParamList) continue;
      found.push({ line: i + 1, value: m[1].trim(), text: trimmed });
    }
  });
  return found;
}

/** Catch blocks (`catch (e) { ... }`), excluding `.catch(` promise handlers. */
function catchBlocks(source) {
  const blocks = [];
  for (const m of source.matchAll(/(?<![.\w])catch\s*\(\s*[\w$]+\s*\)\s*\{/g)) {
    blocks.push({ index: m.index, body: balancedBlock(source, m.index) });
  }
  return blocks;
}

const LOG_CALL = /\b(logHealthCheckFailure|logger\.(error|warn)|req\.log\.(error|warn)|app\.log\.(error|warn)|captureException)\s*\(/;

export function auditUnauthHealthSource(source, label) {
  const problems = [];
  const values = errorPropertyValues(source);

  // ── arm 1: declared codes only ──────────────────────────────────────────────────────────────
  for (const { line, value, text } of values) {
    const ok =
      value.startsWith(`${SANITIZER}(`) ||
      BOUNDED_CODE_LITERAL.test(value) ||
      ALLCAPS_CONST.test(value);
    if (!ok) {
      problems.push(
        `${label}:${line} publishes a non-declared value in the UNAUTHENTICATED health response: ` +
          `\`${text}\`. Only ${SANITIZER}(...), a "[a-z0-9_]" literal, or an ALL_CAPS constant may reach ` +
          `an anonymous caller — driver text carries host, database, role and schema names.`
      );
    }
  }

  // ── arm 2: sanitizer integrity ──────────────────────────────────────────────────────────────
  const usesSanitizer = values.some(({ value }) => value.startsWith(`${SANITIZER}(`));
  const declares = new RegExp(`function\\s+${SANITIZER}\\s*\\(`).exec(source);
  if (usesSanitizer && !declares && !new RegExp(`import[^;]*${SANITIZER}`).test(source)) {
    problems.push(`${label} calls ${SANITIZER}() but neither declares nor imports it.`);
  }
  if (declares) {
    const body = balancedBlock(source, declares.index);
    if (/\.(message|stack)\b/.test(body) || /String\s*\(\s*error/.test(body)) {
      problems.push(
        `${label}: ${SANITIZER}() reads .message/.stack — a sanitizer that forwards the driver text is ` +
          `the original leak wearing a function name.`
      );
    }
    const returns = [...body.matchAll(/return\s+([^;]+);/g)].map((m) => m[1].trim());
    const hasBoundedFallback = returns.some((r) => BOUNDED_CODE_LITERAL.test(r) || ALLCAPS_CONST.test(r));
    if (!hasBoundedFallback) {
      problems.push(
        `${label}: ${SANITIZER}() has no bounded generic fallback — an undeclared error must collapse to a ` +
          `fixed code, never to whatever the driver said.`
      );
    }
  }

  // ── arm 3: the real error must still be logged ──────────────────────────────────────────────
  for (const { body } of catchBlocks(source)) {
    const publishes = errorPropertyValues(body).length > 0;
    if (!publishes) continue;
    if (!LOG_CALL.test(body)) {
      problems.push(
        `${label}: a catch block publishes an error code to the unauthenticated response but never logs the ` +
          `real error server-side. Sanitizing without logging trades an info-disclosure for blindness.`
      );
    }
  }

  return problems;
}

export function auditRepo() {
  const problems = [];
  if (!fs.existsSync(SESSION_MIDDLEWARE)) {
    return [`${rel(SESSION_MIDDLEWARE)} is missing — cannot derive which routes are unauthenticated.`];
  }
  const prefixes = unauthenticatedPrefixes(read(SESSION_MIDDLEWARE));
  if (prefixes.length === 0) {
    return [
      `no auth-exempt url prefix found in ${rel(SESSION_MIDDLEWARE)} — the derivation broke, so this guard ` +
        `would audit nothing. Fix the derivation rather than letting it pass vacuously.`,
    ];
  }
  const files = routeFilesUnderPrefixes(walkTs(BACKEND_SRC), prefixes);
  if (files.length === 0) {
    return [
      `no backend route file registers a route under the auth-exempt prefix(es) ${prefixes.join(", ")} — ` +
        `the discovery broke; this guard must never pass on an empty set.`,
    ];
  }
  for (const file of files) problems.push(...auditUnauthHealthSource(read(file), rel(file)));
  return problems;
}

// ── selftest ──────────────────────────────────────────────────────────────────────────────────

function selftest() {
  const target = path.join(BACKEND_SRC, "health", "health.routes.ts");
  const real = read(target);
  const label = rel(target);
  const failures = [];

  // positive control — the shipped source must be clean, or every mutation arm below is meaningless
  const clean = auditUnauthHealthSource(real, label);
  if (clean.length) failures.push(`real source is NOT clean: ${clean.join(" | ")}`);

  const mutations = [
    {
      name: "pre-fix leak — String((error as Error)?.message ?? error)",
      apply: (s) => s.replaceAll(`error: ${SANITIZER}(error)`, "error: String((error as Error)?.message ?? error)"),
      expect: /non-declared value/,
    },
    {
      name: "template-literal code with an interpolated value",
      apply: (s) => s.replaceAll(`error: ${SANITIZER}(error)`, "error: `check_failed_${name}`"),
      expect: /non-declared value/,
    },
    {
      name: "sanitizer forwards the driver message",
      apply: (s) => s.replace("return HEALTH_ERROR_GENERIC;", "return String((error as Error)?.message);"),
      expect: /forwards the driver text|no bounded generic fallback/,
    },
    {
      name: "real error swallowed — logging removed from the catch blocks",
      apply: (s) => s.replaceAll(/logHealthCheckFailure\([^;]*\);/g, ""),
      expect: /never logs the real error/,
    },
  ];

  for (const { name, apply, expect } of mutations) {
    const mutated = apply(real);
    if (mutated === real) {
      failures.push(`SELFTEST INERT: mutation "${name}" changed nothing — it proves nothing.`);
      continue;
    }
    const hits = auditUnauthHealthSource(mutated, label);
    if (!hits.some((h) => expect.test(h))) {
      failures.push(`SELFTEST FAILED: mutation "${name}" was NOT caught (got: ${hits.join(" | ") || "no problems"})`);
    }
  }

  // control: a bounded literal and an ALL_CAPS constant must NOT be flagged (no false positives)
  const benign = auditUnauthHealthSource(
    `function ${SANITIZER}(e){ return HEALTH_GENERIC; }\nconst a = { error: "missing_redis_url" };\nconst b = { error: HEALTH_GENERIC };\n`,
    "fixture"
  );
  if (benign.length) failures.push(`SELFTEST FAILED: benign bounded codes were flagged: ${benign.join(" | ")}`);

  // control: the derivation arms must fail loudly on an empty set
  if (unauthenticatedPrefixes("no startsWith here").length !== 0) {
    failures.push("SELFTEST FAILED: prefix derivation invented a prefix");
  }

  if (failures.length) {
    console.error(`${LABEL} --selftest FAILED:`);
    for (const f of failures) console.error(`  ✗ ${f}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} --selftest OK — 4 planted defects caught (pre-fix String(error.message) leak, interpolated code, ` +
      `message-forwarding sanitizer, swallowed error), real source clean, no false positives.`
  );
}

if (SELFTEST) {
  selftest();
} else {
  const problems = auditRepo();
  if (problems.length) {
    console.error(`${LABEL} FAILED — ${problems.length} problem(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    process.exit(1);
  }
  console.log(
    `${LABEL} OK — every error code published by an unauthenticated health route is a declared bounded code, ` +
      `the sanitizer falls back generically, and every sanitized failure is still logged server-side.`
  );
}
