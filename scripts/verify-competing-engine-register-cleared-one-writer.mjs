#!/usr/bin/env node
/**
 * OWNER LAW 2026-10-02 — COMPETING-ENGINE AUDIT (Cursor lane: register cleared writer).
 *
 * Canonical register_cleared stamp = account-register.service.ts (toggle via
 * account-register.routes). No second writer of register_cleared = $bound.
 *
 * FAILS IF:
 *   1) account-register.service.ts loses `SET register_cleared = $`.
 *   2) Any other backend file SET register_cleared to a bound parameter.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import os from "node:os";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const BACKEND_SRC = path.join(ROOT, "apps/backend/src");
const CANONICAL = "apps/backend/src/accounting/account-register.service.ts";

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === "node_modules" || entry.name.startsWith(".")) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (entry.name.endsWith(".ts") && !entry.name.endsWith(".test.ts") && !entry.name.endsWith(".d.ts")) {
      out.push(full);
    }
  }
  return out;
}

function relFile(abs) {
  return path.relative(ROOT, abs).split(path.sep).join("/");
}

const BOUND_SET = /register_cleared\s*=\s*\$\d+/i;

export function checkCanonicalRegisterCleared(source) {
  const problems = [];
  if (!BOUND_SET.test(source)) {
    problems.push(
      `${CANONICAL}: must SET register_cleared = $N — this is the one register cleared writer`
    );
  }
  return problems;
}

export function checkNoCompetingRegisterCleared(files) {
  const problems = [];
  for (const abs of files) {
    const rel = relFile(abs);
    if (rel === CANONICAL) continue;
    const src = fs.readFileSync(abs, "utf8");
    if (BOUND_SET.test(src)) {
      problems.push(
        `${rel}: competing register_cleared writer — only ${CANONICAL} may SET register_cleared = $N`
      );
    }
  }
  return problems;
}

export function run() {
  const problems = [];
  const abs = path.join(ROOT, CANONICAL);
  if (!fs.existsSync(abs)) {
    problems.push(`${CANONICAL}: file missing`);
  } else {
    problems.push(...checkCanonicalRegisterCleared(fs.readFileSync(abs, "utf8")));
  }
  problems.push(...checkNoCompetingRegisterCleared(walk(BACKEND_SRC)));
  return {
    ok: problems.length === 0,
    message:
      problems.length === 0
        ? "verify-competing-engine-register-cleared-one-writer: OK — only account-register.service stamps register_cleared"
        : `verify-competing-engine-register-cleared-one-writer FAILED:\n  - ${problems.join("\n  - ")}`,
  };
}

function selftest() {
  let failed = 0;
  const src = fs.readFileSync(path.join(ROOT, CANONICAL), "utf8");
  const mutated = src.replace(/register_cleared\s*=\s*\$\d+/gi, "register_cleared = NULL");
  if (checkCanonicalRegisterCleared(mutated).length === 0) {
    console.error("SELFTEST FAIL: canonical SET removal not caught");
    failed++;
  }
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ce-reg-"));
  const fake = path.join(tmp, "evil.ts");
  fs.writeFileSync(fake, "UPDATE banking.foo SET register_cleared = $3::boolean;\n");
  if (checkNoCompetingRegisterCleared([fake]).length === 0) {
    console.error("SELFTEST FAIL: competing writer not caught");
    failed++;
  }
  fs.rmSync(tmp, { recursive: true, force: true });
  const baseline = run();
  if (!baseline.ok) {
    console.error("SELFTEST FAIL: baseline not green:\n" + baseline.message);
    failed++;
  }
  if (failed > 0) {
    console.error(`verify-competing-engine-register-cleared-one-writer --selftest FAIL (${failed})`);
    process.exit(1);
  }
  console.log("verify-competing-engine-register-cleared-one-writer --selftest PASS");
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  if (process.argv.includes("--selftest")) selftest();
  else {
    const result = run();
    console.log(result.message);
    process.exit(result.ok ? 0 : 1);
  }
}
