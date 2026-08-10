#!/usr/bin/env node
/**
 * SYSTEMIC-42P18 — any set_config('app.*', $N, true|false) without ::text
 * causes Postgres 42P18 under prepared-statement / pool reuse.
 *
 * #5412 cast operating_company_id + true only. Residuals (user_role, active_company_id,
 * operating_company_id + false) kept whole-app GETs failing after that deploy — this guard
 * ratchets the FULL class.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/backend/src");
const LABEL = "verify-systemic-42p18-set-config-text";
const BAD = /set_config\(\s*['"][^'"]+['"]\s*,\s*\$\d+(?!::)\s*,\s*(?:true|false)\s*\)/;

function walk(dir, out = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, ent.name);
    if (ent.isDirectory()) {
      if (ent.name === "__tests__" || ent.name === "node_modules") continue;
      walk(p, out);
    } else if (ent.name.endsWith(".ts") && !ent.name.endsWith(".d.ts") && !ent.name.endsWith(".test.ts")) {
      out.push(p);
    }
  }
  return out;
}

function audit() {
  const problems = [];
  for (const file of walk(SRC)) {
    const text = fs.readFileSync(file, "utf8");
    if (BAD.test(text)) problems.push(path.relative(ROOT, file));
  }
  return problems;
}

function selftest() {
  const target = path.join(SRC, "_helpers/scoped-company-context.ts");
  const orig = fs.readFileSync(target, "utf8");
  if (!orig.includes("$1::text")) {
    console.error(`[${LABEL}] FAIL selftest precondition`);
    process.exit(1);
  }
  const planted = orig.replace(
    "set_config('app.operating_company_id', $1::text, true)",
    "set_config('app.operating_company_id', $1, true)"
  );
  fs.writeFileSync(target, planted);
  try {
    if (audit().length === 0) {
      console.error(`[${LABEL}] FAIL selftest expected offenders`);
      process.exit(1);
    }
  } finally {
    fs.writeFileSync(target, orig);
  }
  console.log(`[${LABEL}] selftest PASS`);
}

const args = process.argv.slice(2);
if (args.includes("--selftest")) selftest();
else {
  const problems = audit();
  if (problems.length) {
    console.error(`[${LABEL}] FAIL ${problems.length} file(s) still use uncast $N in set_config:`);
    for (const p of problems.slice(0, 40)) console.error(" ", p);
    process.exit(1);
  }
  console.log(`[${LABEL}] PASS`);
}
