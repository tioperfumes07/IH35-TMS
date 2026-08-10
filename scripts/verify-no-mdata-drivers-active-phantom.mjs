#!/usr/bin/env node
/**
 * mdata.drivers has NO `active` boolean column (verified on prod).
 * Some cron/background queries used `d.active = true` or `COALESCE(d.active, true)`,
 * which fails at parse time. The canonical active-driver predicate is
 * `d.deactivated_at IS NULL AND d.archived_at IS NULL`.
 *
 * This guard bans the phantom column reference in source SQL while allowing
 * test assertions that explicitly check for its absence.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = resolve(fileURLToPath(import.meta.url), "..", "..");
const SRC_DIR = join(ROOT, "apps/backend/src");

const PHANTOM_RE = /\bd\.active\b/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, out);
    else if (/\.(ts|tsx|js|mjs)$/.test(entry)) out.push(p);
  }
  return out;
}

function isTestAssertion(text, matchIndex) {
  const snippet = text.slice(Math.max(0, matchIndex - 120), matchIndex + 120);
  return /expect\(.*activeSql\)|\.not\.toContain\(["']d\.active["']\)/.test(snippet);
}

export function run() {
  const files = walk(SRC_DIR);
  const offenders = [];

  for (const file of files) {
    const rel = file.slice(ROOT.length + 1);
    const text = readFileSync(file, "utf8");
    let m;
    while ((m = PHANTOM_RE.exec(text)) !== null) {
      if (rel.endsWith(".test.ts") && isTestAssertion(text, m.index)) continue;
      offenders.push(rel);
      break;
    }
  }

  if (offenders.length > 0) {
    return {
      ok: false,
      message: `verify-no-mdata-drivers-active-phantom FAIL — ${offenders.length} source file(s) still reference the non-existent mdata.drivers column \`d.active\`: ${offenders.join(", ")}`,
    };
  }
  return { ok: true, message: "verify-no-mdata-drivers-active-phantom OK" };
}

function selftest() {
  const before = run();
  if (!before.ok) throw new Error(`selftest expected OK on clean tree but got: ${before.message}`);
  return true;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv.includes("--selftest")) {
    const ok = selftest();
    console.log(`verify-no-mdata-drivers-active-phantom selftest ${ok ? "PASS" : "FAIL"}`);
    process.exit(ok ? 0 : 1);
  }
  const { ok, message } = run();
  console.log(message);
  process.exit(ok ? 0 : 1);
}
