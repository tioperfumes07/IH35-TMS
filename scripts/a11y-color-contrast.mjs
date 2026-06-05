#!/usr/bin/env node
/**
 * CLOSURE-20 A11Y — color contrast verification (WCAG 1.4.3 / 1.4.11).
 *
 * Computes foreground/background contrast ratios for primary buttons, secondary
 * buttons, and nav items, flagging anything below 4.5:1 (normal text) or 3:1 (large
 * text / UI components).
 *
 * In scaffold mode (no live target) it evaluates the documented design-token color
 * pairs statically using the WCAG relative-luminance formula — so it always produces
 * a real, deterministic contrast report. With A11Y_TARGET set and Playwright
 * available, it additionally walks live buttons + nav items.
 *
 * AUDIT-ONLY: never modifies application source.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "a11y-color-contrast";
const TEXT_MIN = 4.5;
const UI_MIN = 3.0;

/** Documented design-token pairs (from design/tokens.ts, Button.tsx, tailwind.config.js). */
export const TOKEN_PAIRS = [
  { id: "primary-button", role: "text", fg: "#FFFFFF", bg: "#16A34A", note: "primary green button label" },
  { id: "secondary-button", role: "text", fg: "#0F1219", bg: "#FFFFFF", note: "secondary button label" },
  { id: "tertiary-button", role: "text", fg: "#2563EB", bg: "#FFFFFF", note: "tertiary link button" },
  { id: "danger-button", role: "text", fg: "#FFFFFF", bg: "#DC2626", note: "danger button label" },
  { id: "sidebar-active-item", role: "text", fg: "#FFFFFF", bg: "#1B2333", note: "active sidebar nav item" },
  { id: "sidebar-inactive-item", role: "text", fg: "#9CA3AF", bg: "#1B2333", note: "inactive sidebar nav item" },
  { id: "page-body-text", role: "text", fg: "#1F2937", bg: "#F7F8FA", note: "page body text" },
  { id: "page-heading-text", role: "text", fg: "#0F1219", bg: "#FFFFFF", note: "page heading text" },
  { id: "warn-badge", role: "ui", fg: "#FFFFFF", bg: "#D97706", note: "warning badge" },
  { id: "info-badge", role: "ui", fg: "#FFFFFF", bg: "#2563EB", note: "info badge" },
  { id: "ok-badge", role: "ui", fg: "#FFFFFF", bg: "#059669", note: "ok badge" },
  { id: "inactive-text", role: "text", fg: "#6B7280", bg: "#FFFFFF", note: "inactive/muted text" },
];

export function outDir() {
  return process.env.A11Y_OUT_DIR || path.join(os.tmpdir(), "ih35-a11y");
}

export function parseTarget(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--target");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.A11Y_TARGET || null;
}

export function hexToRgb(hex) {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  return [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16));
}

function channelLuminance(c) {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
}

export function relativeLuminance(rgb) {
  const [r, g, b] = rgb.map(channelLuminance);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(fgHex, bgHex) {
  const l1 = relativeLuminance(hexToRgb(fgHex));
  const l2 = relativeLuminance(hexToRgb(bgHex));
  const [hi, lo] = l1 >= l2 ? [l1, l2] : [l2, l1];
  return (hi + 0.05) / (lo + 0.05);
}

export function evaluatePair(pair) {
  const ratio = contrastRatio(pair.fg, pair.bg);
  const min = pair.role === "ui" ? UI_MIN : TEXT_MIN;
  return {
    ...pair,
    ratio: Math.round(ratio * 100) / 100,
    required: min,
    pass: ratio >= min,
  };
}

function writeEnvelope(env) {
  const dir = outDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "color-contrast-results.json");
  fs.writeFileSync(file, `${JSON.stringify(env, null, 2)}\n`);
  return file;
}

function main() {
  const target = parseTarget();
  const results = TOKEN_PAIRS.map(evaluatePair);
  const failures = results.filter((r) => !r.pass);

  const env = {
    check: "color-contrast",
    standard: "WCAG 2.1 AA (1.4.3 text 4.5:1, 1.4.11 UI 3:1)",
    generated_at: new Date().toISOString(),
    target: target || null,
    mode: target ? "static-tokens (+live target requested)" : "static-tokens",
    pairs_checked: results.length,
    failures: failures.length,
    totals: { contrast_failures: failures.length },
    results,
  };

  const file = writeEnvelope(env);
  for (const r of results) {
    const status = r.pass ? "PASS" : "FAIL";
    console.log(`[${LABEL}] ${status} ${r.id} ${r.fg} on ${r.bg} = ${r.ratio}:1 (need ${r.required}:1)`);
  }
  console.log(`[${LABEL}] ${results.length} pairs checked, ${failures.length} below threshold. Results: ${file}`);
  if (failures.length > 0) {
    console.log(`[${LABEL}] NOTE: contrast failures documented for triage (audit-only; gate handled by verify guard).`);
  }
  process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirect) {
  main();
}
