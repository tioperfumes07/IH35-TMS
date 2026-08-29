#!/usr/bin/env node
/**
 * T-01 — after requireAuth() sends 401, the Fastify handler MUST `return reply`
 * (not `return;` / `return null` / `return false`). Otherwise Fastify logs
 * FST_ERR_REP_ALREADY_SENT and the SPA sees HTTP 500 (outage) instead of 401 (logged out).
 *
 * Rule 17: verify-steps only.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const LABEL = "verify-requireauth-returns-reply";

/** Bad: handler returns undefined after 401. Helpers may return null/false. */
const BAD = /if\s*\(\s*!requireAuth\(\s*req\s*,\s*reply\s*\)\s*\)\s*return\s*;/g;

function walkTs(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) walkTs(p, acc);
    else if (ent.name.endsWith(".ts")) acc.push(p);
  }
  return acc;
}

export function findCurrentAuthUserReplyReturns(srcRoot = SRC) {
  const hits = [];
  const re = /function currentAuthUser[\s\S]{0,400}?if\s*\(\s*!requireAuth\(\s*req\s*,\s*reply\s*\)\s*\)\s*return reply/;
  for (const file of walkTs(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    if (re.test(text)) hits.push(path.relative(ROOT, file));
  }
  return hits;
}

/** Named helpers / local `auth()` that return FastifyReply — TS2339 on `.uuid` (Render build_failed). */
export function findAuthHelperReplyReturns(srcRoot = SRC) {
  const hits = [];
  const named = /function\s+\w+\s*\([^)]*reply[^)]*\)\s*\{[\s\S]{0,220}?if\s*\(\s*!requireAuth\(\s*req\s*,\s*reply\s*\)\s*\)\s*return reply/;
  const localAuth = /const\s+auth\s*=\s*\([^)]*reply[^)]*\)\s*=>\s*\{[\s\S]{0,180}?if\s*\(\s*!requireAuth\(\s*req\s*,\s*reply\s*\)\s*\)\s*return reply/;
  const driverSess = /function requireDriverSession[\s\S]{0,400}?if\s*\(\s*!requireAuth\(\s*req\s*,\s*reply\s*\)\s*\)\s*return reply/;
  for (const file of walkTs(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    if (named.test(text) || localAuth.test(text) || driverSess.test(text)) hits.push(rel);
  }
  return hits;
}

export function findBadRequireAuthReturns(srcRoot = SRC) {
  const hits = [];
  for (const file of walkTs(srcRoot)) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    let m;
    const re = new RegExp(BAD.source, "g");
    while ((m = re.exec(text))) {
      const line = text.slice(0, m.index).split("\n").length;
      hits.push({ file: rel, line, snippet: m[0] });
    }
  }
  return hits;
}

function selftest() {
  const plant = `async (req, reply) => {\n  if (!requireAuth(req, reply)) return;\n}\n`;
  const good = `async (req, reply) => {\n  if (!requireAuth(req, reply)) return reply;\n}\n`;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-requireauth-"));
  try {
    fs.writeFileSync(path.join(tmp, "bad.ts"), plant);
    const authBad = `function currentAuthUser(req, reply) {\n  if (!requireAuth(req, reply)) return reply;\n  return req.user;\n}\n`;
    fs.writeFileSync(path.join(tmp, "authbad.ts"), authBad);
    if (!findCurrentAuthUserReplyReturns(tmp).some((f) => f.endsWith("authbad.ts"))) {
      throw new Error(`${LABEL} selftest: currentAuthUser return reply must FAIL (TS2339 narrowing)`);
    }
    const helperBad = `function authUser(req, reply) {\n  if (!requireAuth(req, reply)) return reply;\n  return req.user;\n}\n`;
    fs.writeFileSync(path.join(tmp, "helperbad.ts"), helperBad);
    if (!findAuthHelperReplyReturns(tmp).some((f) => f.endsWith("helperbad.ts"))) {
      throw new Error(`${LABEL} selftest: named auth helper return reply must FAIL`);
    }
    const badHits = findBadRequireAuthReturns(tmp);
    if (!badHits.some((h) => h.file.endsWith("bad.ts"))) {
      throw new Error(`${LABEL} selftest: planted return; must FAIL`);
    }
    const onlyGood = findBadRequireAuthReturns(tmp).filter((h) => h.file.endsWith("good.ts"));
    if (onlyGood.length) throw new Error(`${LABEL} selftest: return reply must PASS`);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`${LABEL} --selftest PASS (planted return; FAILS, return reply PASSES)`);
}

function live() {
  const hits = findBadRequireAuthReturns();
  if (hits.length) {
    console.error(`${LABEL}: FAIL ${hits.length} requireAuth early-returns that do not return reply:`);
    for (const h of hits.slice(0, 40)) console.error(`  ${h.file}:${h.line} ${JSON.stringify(h.snippet)}`);
    process.exit(1);
  }
  const authHits = findCurrentAuthUserReplyReturns();
  if (authHits.length) {
    console.error(`${LABEL}: FAIL currentAuthUser must return null (not reply) so authUser.uuid narrows:`);
    for (const f of authHits.slice(0, 20)) console.error(`  ${f}`);
    process.exit(1);
  }
  const helperHits = findAuthHelperReplyReturns();
  if (helperHits.length) {
    console.error(`${LABEL}: FAIL auth helpers must return null/false (not reply) so User narrows:`);
    for (const f of helperHits.slice(0, 30)) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL}: PASS — requireAuth handlers return reply; auth helpers return null/false`);
}

const isMain = Boolean(process.argv[1] && path.basename(String(process.argv[1])) === "verify-requireauth-returns-reply.mjs");
if (isMain) {
  if (process.argv.includes("--selftest")) {
    selftest();
    process.exit(0);
  }
  live();
}
