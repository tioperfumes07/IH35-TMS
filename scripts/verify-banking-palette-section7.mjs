#!/usr/bin/env node
/**
 * verify-banking-palette-section7.mjs — §7 palette ratchet for Banking UI only.
 *
 * §7 locks status colors to navy/slate; green (#d1fae5 pill) is Class pill only; red is delete/Accident.
 * Off-palette emerald/green/amber/yellow Tailwind status classes and arbitrary green hex are drift.
 *
 * Usage:
 *   node scripts/verify-banking-palette-section7.mjs
 *   node scripts/verify-banking-palette-section7.mjs --selftest
 *
 * To lower BASELINE after a recolor sweep:
 *   PALETTE_BASELINE_PRINT=1 node scripts/verify-banking-palette-section7.mjs
 */
import { readFileSync, readdirSync, statSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import path from "node:path";
import process from "node:process";

const LABEL = "verify-banking-palette-section7";
const ROOT = "apps/frontend/src/pages/banking";

const OFF_PALETTE_CLASS =
  /\b(bg|text|border|ring|from|to|via|divide|ring-offset|outline|decoration|placeholder|accent|fill|stroke)-(amber|emerald|green|yellow)-\d{2,3}\b/g;

// Common off-palette green hex (§7 reserves #d1fae5 for Class pill only).
const OFF_PALETTE_HEX =
  /#(?:059669|047857|065f46|064e3b|10b981|34d399|6ee7b7|a7f3d0|d1fae5|ecfdf5|16a34a|15803d|166534|14532d|22c55e|4ade80|86efac|bbf7d0|dcfce7|f0fdf4)\b/gi;

const BASELINE = 0;

function walk(dir) {
  let out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const e of entries) {
    const full = path.join(dir, e);
    const st = statSync(full);
    if (st.isDirectory()) out = out.concat(walk(full));
    else if (/\.(tsx?|css)$/.test(e)) out.push(full);
  }
  return out;
}

export function scanBankingPalette(rootDir = ROOT) {
  const files = walk(rootDir);
  let count = 0;
  const perFile = [];
  const samples = [];

  for (const f of files) {
    const src = readFileSync(f, "utf8");
    const classHits = src.match(OFF_PALETTE_CLASS) ?? [];
    const hexHits = src.match(OFF_PALETTE_HEX) ?? [];
    const n = classHits.length + hexHits.length;
    if (n) {
      count += n;
      perFile.push([f, n]);
      for (const h of [...classHits, ...hexHits].slice(0, 3)) {
        samples.push(`${f}: ${h}`);
      }
    }
  }

  return { count, perFile, samples };
}

function fail(msg) {
  console.error(`FAIL ${LABEL}: ${msg}`);
  process.exit(1);
}

function runSelftest() {
  const clean = scanBankingPalette();
  const dirtySrc = 'export const x = "text-emerald-700 bg-green-50 border-[#16a34a]";\n';
  const tmpRoot = path.join(process.cwd(), ".tmp-banking-palette-selftest");
  const tmpFile = path.join(tmpRoot, "Violation.tsx");
  try {
    mkdirSync(tmpRoot, { recursive: true });
    writeFileSync(tmpFile, dirtySrc);
    const dirty = scanBankingPalette(tmpRoot);
    if (dirty.count < 2) {
      fail("--selftest: injected violations not detected");
    }
    if (clean.count !== BASELINE) {
      fail(`--selftest: live banking tree expected ${BASELINE} violations, got ${clean.count}`);
    }
    console.log(`OK ${LABEL}: --selftest passed (detects injected drift; live count=${clean.count})`);
    process.exit(0);
  } finally {
    try {
      rmSync(tmpRoot, { recursive: true, force: true });
    } catch {
      /* ignore */
    }
  }
}

if (process.argv.includes("--selftest")) {
  runSelftest();
}

const { count, perFile, samples } = scanBankingPalette();

if (process.env.PALETTE_BASELINE_PRINT) {
  console.log(`${LABEL}: ${count} off-palette hits across ${perFile.length} banking files`);
  process.exit(0);
}

if (count > BASELINE) {
  perFile.sort((a, b) => b[1] - a[1]);
  fail(
    `banking §7 palette drift: ${count} > baseline ${BASELINE}. Use slate/navy tokens ` +
      `(text-slate-600|700, bg-slate-100, border-slate-200; red only for delete/Accident).\n` +
      `  Samples:\n  ${samples.slice(0, 12).join("\n  ")}`
  );
}

if (count < BASELINE) {
  console.log(
    `OK ${LABEL}: ${count} off-palette hits (< baseline ${BASELINE}). Lower BASELINE via PALETTE_BASELINE_PRINT=1.`
  );
} else {
  console.log(`OK ${LABEL}: ${count} off-palette hits (banking §7 clean; baseline ${BASELINE}).`);
}
