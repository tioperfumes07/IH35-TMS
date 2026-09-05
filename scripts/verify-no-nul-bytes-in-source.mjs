#!/usr/bin/env node
/**
 * verify-no-nul-bytes-in-source — a NUL byte (\x00) embedded in a .ts/.tsx source file makes the
 * WHOLE FILE invisible to every recursive `grep -r` / ugrep search in this environment (they treat
 * a NUL byte as the binary-file signal and silently skip the file, matching zero lines with no
 * error, no "binary file" notice — nothing). That is a grep-visibility landmine, not a cosmetic
 * nit: any future "grep the codebase to prove X doesn't exist / IS wired" check silently produces a
 * false negative for every symbol in that file.
 *
 * FOUND LIVE 2026-09-05 (CC-1): apps/backend/src/safety/safety.routes.ts carried 4 literal NUL
 * bytes (2 composite-dedup-key template literals, `${a}\x00${b}\x00${c}`, clearly meant to be a
 * plain space — no comment anywhere argues for NUL-as-delimiter) — `file(1)` classified the whole
 * 1,499-line route file as "data", and a wrapped `grep -r "spawn-liability" apps/backend/src`
 * returned ZERO matches even though the route was fully registered and wired at line 1108. That
 * false negative produced a real board finding (CC3-GATE-ROT-06) claiming a live, working,
 * money-lane route (writes driver_finance.driver_liabilities + driver_settlement_deductions) did
 * not exist. Root-caused and fixed same session (NUL -> space); this guard locks the fix in.
 *
 * WHAT IT ASSERTS: no non-test, non-generated .ts/.tsx/.mjs/.cjs/.js file under apps/*\/src or
 * scripts/ contains a literal NUL byte. Binary/generated paths (node_modules, dist, coverage) are
 * excluded by construction (not walked).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-nul-bytes-in-source";
const ROOTS = [
  path.join(ROOT, "apps", "backend", "src"),
  path.join(ROOT, "apps", "frontend", "src"),
  path.join(ROOT, "apps", "driver-pwa", "src"),
  path.join(ROOT, "scripts"),
];
const EXT = /\.(ts|tsx|mjs|cjs|js)$/;
const SKIP_DIRS = new Set(["node_modules", "dist", "coverage", "__tests__", ".git"]);

function walk(dir, out = []) {
  if (!fs.existsSync(dir)) return out;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (SKIP_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) walk(p, out);
    else if (EXT.test(e.name) && !/\.(test|spec)\.[cm]?[tj]sx?$/.test(e.name)) out.push(p);
  }
  return out;
}

export function findNulByteFiles(roots = ROOTS) {
  const offenders = [];
  for (const root of roots) {
    for (const file of walk(root)) {
      const buf = fs.readFileSync(file);
      const idx = buf.indexOf(0);
      if (idx === -1) continue;
      const line = buf.subarray(0, idx).toString("utf8").split("\n").length;
      offenders.push({ file: path.relative(ROOT, file).replace(/\\/g, "/"), line });
    }
  }
  return offenders;
}

function report(offenders) {
  if (!offenders.length) {
    console.log(`${LABEL} OK — no source file carries an embedded NUL byte`);
    return 0;
  }
  console.error(`${LABEL} FAIL — ${offenders.length} file(s) with an embedded NUL byte (makes the file invisible to \`grep -r\`):\n`);
  for (const o of offenders) console.error(`  - ${o.file}:${o.line}`);
  console.error(`\nReplace the NUL byte with the printable character it almost certainly was meant to be (a plain space is the common case for a composite dedup key).\n`);
  return 1;
}

async function selftest() {
  const os = await import("node:os");
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "nul-src-"));
  const f = path.join(tmp, "svc.ts");
  const failures = [];

  fs.writeFileSync(f, "const key = `${a} ${b}`;\n");
  if (findNulByteFiles([tmp]).length !== 0) failures.push("case1 FAIL — clean file must be GREEN.");

  fs.writeFileSync(f, Buffer.from("const key = `${a}\x00${b}`;\n", "utf8"));
  if (findNulByteFiles([tmp]).length !== 1) failures.push("case2 FAIL — NUL byte must go RED.");

  fs.writeFileSync(f, "const key = `${a} ${b}`;\n");
  if (findNulByteFiles([tmp]).length !== 0) failures.push("case3 FAIL — restore must return GREEN.");

  fs.rmSync(tmp, { recursive: true, force: true });
  if (failures.length) {
    for (const x of failures) console.error(`${LABEL} ${x}`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — clean GREEN, NUL byte RED, restore GREEN`);
  return 0;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  process.exit(process.argv.includes("--selftest") ? await selftest() : report(findNulByteFiles()));
}
