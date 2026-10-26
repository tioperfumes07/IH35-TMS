#!/usr/bin/env node
/**
 * CLS-PROPORTION-CHROME — modal/side-panel density vs QBO approved chrome.
 *
 * Root cause: shared Modal / ParityDrawer lacked a ratcheting density contract
 * (field height + chrome padding), so individual surfaces ballooned with p-8 /
 * tall fields and drifted from approved screens.
 *
 * Usage:
 *   node scripts/verify-proportion-chrome-modal-drawer-density.mjs
 *   node scripts/verify-proportion-chrome-modal-drawer-density.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");

const FILES = {
  css: "apps/frontend/src/styles/proportion-chrome.css",
  sizing: "apps/frontend/src/components/parity/sizing.ts",
  modal: "apps/frontend/src/components/Modal.tsx",
  drawer: "apps/frontend/src/components/parity/ParityDrawer.tsx",
};

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

const LAW = {
  tokens: "apps/frontend/src/design/tokens.ts",
  lawCss: "apps/frontend/src/styles/control-sizing-law.css",
};

/**
 * The law value is DERIVED, never typed here: FORM_FIELD_CONTROL_SIZE_CLASS (h-N → N*4 px) — owner design law
 * 2026-10-25 rule 2 ("40px for a field being edited"). proportion-chrome.css out-specifies the zero-specificity
 * control-sizing-law.css inside every Modal/ParityDrawer, so its token MUST equal the law or the law never reaches a
 * dialog field (the 36px-vs-40px drift found 2026-10-25). sizing.ts must agree too.
 */
export function check(src) {
  const errors = [];
  const tokenClass = (src.tokens.match(/FORM_FIELD_CONTROL_SIZE_CLASS\s*=\s*"([^"]+)"/) || [])[1] || "";
  const hN = (tokenClass.match(/\bh-(\d+)\b/) || [])[1];
  const lawPx = hN ? Number(hN) * 4 : null;
  if (!lawPx) errors.push("tokens.ts FORM_FIELD_CONTROL_SIZE_CLASS has no h-N height");
  const lawCssPx = Number((src.lawCss.match(/:where\(\[role="dialog"\]\)[\s\S]*?\{[^}]*?\bheight:\s*(\d+)px/) || [])[1]);
  if (lawPx && lawCssPx !== lawPx) errors.push(`control-sizing-law.css field height ${lawCssPx}px != token ${lawPx}px`);
  for (const m of ["CLS-PROPORTION-CHROME", 'data-proportion-chrome="qbo-compact"', "--ih35-chrome-pad-x: 1rem", "--ih35-chrome-pad-y: 0.75rem"]) {
    if (!src.css.includes(m)) errors.push(`proportion-chrome.css missing: ${m}`);
  }
  const cssPx = Number((src.css.match(/--ih35-field-height:\s*(\d+)px/) || [])[1]);
  if (lawPx && cssPx !== lawPx) errors.push(`proportion-chrome.css --ih35-field-height ${cssPx}px != owner law ${lawPx}px`);
  if (!/height:\s*var\(--ih35-field-height\)[\s\S]*?max-height:\s*var\(--ih35-field-height\)/.test(src.css)) {
    errors.push("proportion-chrome.css lost the shared single-line height + max-height rule");
  }
  const sizingPx = Number((src.sizing.match(/fieldHeightPx:\s*(\d+)/) || [])[1]);
  if (lawPx && sizingPx !== lawPx) errors.push(`sizing.ts fieldHeightPx ${sizingPx} != owner law ${lawPx}`);
  if (!src.sizing.includes("PARITY_FIELD_HEIGHT_CLASS")) errors.push("sizing.ts must export PARITY_FIELD_HEIGHT_CLASS");
  if (hN && !new RegExp(`PARITY_FIELD_HEIGHT_CLASS\\s*=\\s*"h-${hN}\\b`).test(src.sizing)) errors.push(`sizing.ts PARITY_FIELD_HEIGHT_CLASS must be h-${hN}`);
  if (!src.sizing.includes("chromePadXPx: 16") || !src.sizing.includes("chromePadYPx: 12")) {
    errors.push("sizing.ts must export chromePadXPx/chromePadYPx matching px-4/py-3");
  }
  for (const [name, f] of [["Modal.tsx", src.modal], ["ParityDrawer", src.drawer]]) {
    if (!f.includes("proportion-chrome.css")) errors.push(`${name} must import proportion-chrome.css`);
    if (!f.includes('data-proportion-chrome="qbo-compact"')) errors.push(`${name} must set data-proportion-chrome=qbo-compact`);
    if (!f.includes("px-4 py-3")) errors.push(`${name} must keep px-4 py-3 density`);
  }
  if (/\bclassName="[^"]*\bp-8\b/.test(src.modal) || /\bpy-8\b/.test(src.modal)) errors.push("Modal.tsx must not use balloon p-8/py-8 on the shared shell");
  if (/\bp-8\b/.test(src.drawer) || /\bpy-8\b/.test(src.drawer)) errors.push("ParityDrawer must not use balloon p-8/py-8");
  return { errors, lawPx };
}

function readAll() {
  return { css: read(FILES.css), sizing: read(FILES.sizing), modal: read(FILES.modal), drawer: read(FILES.drawer), tokens: read(LAW.tokens), lawCss: read(LAW.lawCss) };
}

function run() {
  const { errors, lawPx } = check(readAll());
  if (errors.length) {
    console.error("verify-proportion-chrome-modal-drawer-density FAIL:");
    for (const e of errors) console.error(" -", e);
    process.exit(1);
  }
  console.log(`verify-proportion-chrome-modal-drawer-density OK — Modal+ParityDrawer qbo-compact density + ${lawPx}px field token = owner law`);
}

function selftest() {
  const real = readAll();
  let ok = check(real).errors.length === 0;
  if (!ok) console.error("selftest FAIL — real source does not pass:", check(real).errors);
  const plants = [
    ["the 36px drift (proportion token off the law)", { ...real, css: real.css.replace(/--ih35-field-height:\s*\d+px/, "--ih35-field-height: 36px") }],
    ["sizing.ts off the law", { ...real, sizing: real.sizing.replace(/fieldHeightPx:\s*\d+/, "fieldHeightPx: 32") }],
    ["law css off the token", { ...real, lawCss: real.lawCss.replace(/height:\s*40px/, "height: 36px") }],
    ["max-height pin dropped", { ...real, css: real.css.replace(/max-height:\s*var\(--ih35-field-height\)/g, "max-height: none") }],
    ["balloon padding on Modal", { ...real, modal: real.modal + '\n<div className="p-8" />' }],
  ];
  for (const [name, src] of plants) {
    const changed = JSON.stringify(src) !== JSON.stringify(real);
    const caught = changed && check(src).errors.length > 0;
    console.log(`  ${caught ? "PASS" : "FAIL"}  planted "${name}" caught`);
    ok = ok && caught;
  }
  console.log(`verify-proportion-chrome-modal-drawer-density SELFTEST ${ok ? "PASS" : "FAIL"} (in-memory; no tracked file is written)`);
  process.exit(ok ? 0 : 1);
}

if (process.argv.includes("--selftest")) selftest();
else run();
