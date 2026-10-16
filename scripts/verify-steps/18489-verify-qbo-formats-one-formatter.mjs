#!/usr/bin/env node
/**
 * LEAD 443.156 item 5 — B10 QBO FORMATS APP-WIDE: dates MM/DD/YYYY, money $1,234.56 (minus for negatives), numbers with
 * separators — ONE formatter module (apps/frontend/src/utils/qboFormat.ts → lib/money + lib/formatDate).
 *
 *   1. The barrel exports formatUsdCents / formatUsd / formatNumber / formatDateUS / formatDateTimeUS.
 *   2. No ad-hoc formatting outside lib/ + utils/: `.toLocaleString(`, `.toLocaleDateString(`, `.toLocaleTimeString(`,
 *      `new Intl.NumberFormat(`, `new Intl.DateTimeFormat(`, or a hand-built "$" + toFixed(2). Banking and the invoice
 *      list carry none (two named exceptions: the matcher drawer, owned by another round, and the month-group header,
 *      which no date formatter produces); every other file is pinned in the SHRINK-ONLY allowlist
 *      18489-adhoc-format-sites.allowlist.json (a new file or a higher count fails; the allowlist only shrinks vs
 *      origin/main).
 *
 * --selftest: plants each regression and asserts the guard fails.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { resolve, dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const ALLOW_REL = "scripts/verify-steps/18489-adhoc-format-sites.allowlist.json";
const BARREL = "apps/frontend/src/utils/qboFormat.ts";
const EXEMPT_DIR = /^apps\/frontend\/src\/(lib|utils)\//;
const ZERO_SURFACES = /^apps\/frontend\/src\/(pages\/banking\/|components\/banking\/|pages\/accounting\/InvoicesListPage|pages\/accounting\/InvoiceDetailPage|pages\/accounting\/modals\/InvoiceTypeModalBase)/;
const NAMED_EXCEPTIONS = {
  // 443.156 order: do not touch the matcher (MatchDrawer) beyond item 4.
  "apps/frontend/src/pages/banking/components/MatchDrawer.tsx": 1,
  // "October 2026" month-group header — a heading, not a date cell; no formatter produces it.
  "apps/frontend/src/pages/banking/components/bankTxnSortGroup.ts": 1,
};
const PATTERNS = [
  /\.toLocaleString\(/g,
  /\.toLocaleDateString\(/g,
  /\.toLocaleTimeString\(/g,
  /new Intl\.NumberFormat\(/g,
  /new Intl\.DateTimeFormat\(/g,
  /`\$\$\{[^`]*\.toFixed\(2\)/g,
];

export function countAdhoc(src) {
  const code = src.split("\n").filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l)).join("\n");
  return PATTERNS.reduce((n, re) => n + (code.match(re) ?? []).length, 0);
}

function frontendFiles(dir = resolve(ROOT, "apps/frontend/src"), out = []) {
  for (const name of readdirSync(dir)) {
    const abs = join(dir, name);
    if (statSync(abs).isDirectory()) {
      if (!["__tests__", "node_modules", "generated"].includes(name)) frontendFiles(abs, out);
    } else if (/\.(tsx?|jsx?)$/.test(abs) && !/\.test\.|\.spec\./.test(abs)) out.push(abs);
  }
  return out;
}

export function check({ barrel, files, allow, mainAllow }) {
  const findings = [];
  for (const name of ["formatUsdCents", "formatUsd", "formatNumber", "formatDateUS", "formatDateTimeUS"]) {
    if (!new RegExp(`\\b${name}\\b`).test(barrel)) findings.push(`${BARREL}: the one formatter module does not export ${name} (1)`);
  }
  for (const [rel, src] of files) {
    if (EXEMPT_DIR.test(rel)) continue;
    const n = countAdhoc(src);
    if (!n) continue;
    if (ZERO_SURFACES.test(rel)) {
      if (n > (NAMED_EXCEPTIONS[rel] ?? 0)) findings.push(`${rel}: ${n} ad-hoc date/money/number format call(s) on Banking / invoices — use utils/qboFormat (2)`);
      continue;
    }
    if (allow[rel] == null) findings.push(`${rel}: new ad-hoc format call(s) (${n}) — use utils/qboFormat (2)`);
    else if (n > allow[rel]) findings.push(`${rel}: ${n} ad-hoc format calls, allowlist caps it at ${allow[rel]} (2)`);
  }
  if (mainAllow) {
    for (const [rel, cap] of Object.entries(allow)) {
      if (mainAllow[rel] == null) findings.push(`${ALLOW_REL}: ${rel} added — the allowlist only shrinks (2)`);
      else if (cap > mainAllow[rel]) findings.push(`${ALLOW_REL}: ${rel} raised ${mainAllow[rel]} → ${cap} — the allowlist only shrinks (2)`);
    }
  }
  return findings;
}

function load() {
  const files = frontendFiles().map((abs) => [relative(ROOT, abs), readFileSync(abs, "utf8")]);
  const allow = JSON.parse(readFileSync(resolve(ROOT, ALLOW_REL), "utf8")).files;
  const r = spawnSync("git", ["show", `origin/main:${ALLOW_REL}`], { cwd: ROOT, encoding: "utf8" });
  const mainAllow = r.status === 0 ? JSON.parse(r.stdout).files : null;
  return { barrel: readFileSync(resolve(ROOT, BARREL), "utf8"), files, allow, mainAllow };
}

if (process.argv.includes("--selftest")) {
  const base = load();
  if (check(base).length) {
    console.error("SELFTEST FAIL: baseline not clean", check(base));
    process.exit(1);
  }
  const plants = [
    ["barrel loses money", { ...base, barrel: base.barrel.replace(/\bformatUsdCents\b/g, "formatX") }],
    ["banking toLocaleString", { ...base, files: [...base.files, ["apps/frontend/src/pages/banking/X.tsx", "n.toLocaleString()"]] }],
    ["banking $ toFixed", { ...base, files: [...base.files, ["apps/frontend/src/pages/banking/Y.tsx", "const s = `$${(c / 100).toFixed(2)}`;"]] }],
    ["new file elsewhere", { ...base, files: [...base.files, ["apps/frontend/src/pages/x/Z.tsx", "new Intl.DateTimeFormat('en-US')"]] }],
    ["allowlist grows", { ...base, allow: { ...base.allow, "apps/frontend/src/pages/x/W.tsx": 3 }, mainAllow: base.mainAllow ?? base.allow }],
  ];
  for (const [name, input] of plants) {
    if (check(input).length === 0) {
      console.error(`SELFTEST FAIL: plant "${name}" not caught`);
      process.exit(1);
    }
  }
  console.log(`SELFTEST PASS: ${plants.length} plants caught`);
  process.exit(0);
}

const findings = check(load());
if (findings.length) {
  console.error(`verify-qbo-formats-one-formatter FAIL (${findings.length}):`);
  for (const f of findings) console.error(`  ${f}`);
  process.exit(1);
}
console.log("verify-qbo-formats-one-formatter PASS: Banking + invoices format through utils/qboFormat; ad-hoc formatting elsewhere is shrink-only");
