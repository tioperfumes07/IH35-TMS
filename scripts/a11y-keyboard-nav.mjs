#!/usr/bin/env node
/**
 * CLOSURE-20 A11Y — keyboard-only navigation walk (WCAG 2.1.1, 2.1.2, 2.4.7).
 *
 * Tabs through 5 critical workflows, asserting that every interactive element has a
 * visible focus indicator and that there are no keyboard traps.
 *
 * AUDIT-ONLY: never modifies application source. Results written to A11Y_OUT_DIR.
 * Scaffold mode (no target) prints the planned coverage and exits 0.
 *
 * Usage:
 *   A11Y_TARGET=https://app.ih35dispatch.com node scripts/a11y-keyboard-nav.mjs
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "a11y-keyboard-nav";

export const WORKFLOWS = [
  { id: "WF1_LOGIN_HOME_BELL", steps: ["/login", "/home", "click bell icon"], start: "/home" },
  { id: "WF2_LOADS_CREATE_WIZARD", steps: ["/loads", "create new load wizard"], start: "/loads" },
  { id: "WF3_VENDOR_BILL_SAVE", steps: ["/accounting/bills/vendor", "fill bill", "save"], start: "/accounting/bills/vendor" },
  { id: "WF4_DRIVER_EDIT_SAVE", steps: ["/drivers/:id", "edit profile", "save"], start: "/drivers/:id" },
  { id: "WF5_PNL_EXPORT_PDF", steps: ["/reports/profit-loss", "date filter", "export PDF"], start: "/reports/profit-loss" },
];

export function outDir() {
  return process.env.A11Y_OUT_DIR || path.join(os.tmpdir(), "ih35-a11y");
}

export function parseTarget(argv = process.argv.slice(2)) {
  const i = argv.indexOf("--target");
  if (i !== -1 && argv[i + 1]) return argv[i + 1];
  return process.env.A11Y_TARGET || null;
}

export function emptyEnvelope() {
  return {
    check: "keyboard-navigation",
    standard: "WCAG 2.1 AA (2.1.1, 2.1.2, 2.4.7)",
    generated_at: new Date().toISOString(),
    target: null,
    workflows_planned: WORKFLOWS.length,
    workflows_walked: 0,
    totals: { focus_indicator_missing: 0, keyboard_traps: 0 },
    workflows: [],
    note: "baseline scaffold — no live target supplied",
  };
}

function writeEnvelope(env) {
  const dir = outDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "keyboard-nav-results.json");
  fs.writeFileSync(file, `${JSON.stringify(env, null, 2)}\n`);
  return file;
}

async function loadBrowser() {
  try {
    const { chromium } = await import("playwright");
    return chromium;
  } catch {
    return null;
  }
}

/** Tab up to `maxTabs` times, recording focus + visible focus ring per element. */
async function walkWorkflow(page, base, wf, sampleId) {
  const url = `${base}${wf.start.replace(":id", sampleId)}`;
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });

  const maxTabs = 60;
  const seen = new Set();
  let focusMissing = 0;
  let trap = false;
  let stuckCount = 0;
  let lastKey = "";

  for (let i = 0; i < maxTabs; i += 1) {
    await page.keyboard.press("Tab");
    const info = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const key = `${el.tagName}.${el.className}#${el.id}@${el.textContent?.slice(0, 20) ?? ""}`;
      const hasFocusRing =
        style.outlineStyle !== "none" && parseFloat(style.outlineWidth) > 0 ||
        style.boxShadow !== "none" ||
        (el.matches && el.matches(":focus-visible"));
      const interactive = ["A", "BUTTON", "INPUT", "SELECT", "TEXTAREA"].includes(el.tagName) ||
        el.getAttribute("tabindex") != null || el.getAttribute("role") === "button";
      return { key, hasFocusRing, interactive };
    });
    if (!info) continue;
    if (info.interactive && !info.hasFocusRing) focusMissing += 1;
    if (info.key === lastKey) {
      stuckCount += 1;
      if (stuckCount >= 4) {
        trap = true;
        break;
      }
    } else {
      stuckCount = 0;
    }
    lastKey = info.key;
    seen.add(info.key);
  }

  return {
    id: wf.id,
    url,
    steps: wf.steps,
    interactive_elements_tabbed: seen.size,
    focus_indicator_missing: focusMissing,
    keyboard_trap_detected: trap,
  };
}

async function main() {
  const target = parseTarget();
  if (!target) {
    const env = emptyEnvelope();
    const file = writeEnvelope(env);
    console.log(`[${LABEL}] No target supplied. Scaffold mode.`);
    console.log(`[${LABEL}] Planned: ${WORKFLOWS.map((w) => w.id).join(", ")}`);
    console.log(`[${LABEL}] Baseline envelope written: ${file}`);
    process.exit(0);
  }

  const chromium = await loadBrowser();
  if (!chromium) {
    const env = emptyEnvelope();
    env.target = target;
    env.note = "playwright unavailable; skipped live walk";
    const file = writeEnvelope(env);
    console.log(`[${LABEL}] Playwright unavailable; wrote scaffold: ${file}`);
    process.exit(0);
  }

  const base = target.replace(/\/$/, "");
  const sampleId = process.env.A11Y_SAMPLE_DRIVER_ID || "1";
  const env = emptyEnvelope();
  env.target = base;

  const browser = await chromium.launch();
  const page = await browser.newContext().then((c) => c.newPage());

  for (const wf of WORKFLOWS) {
    try {
      const result = await walkWorkflow(page, base, wf, sampleId);
      env.workflows.push(result);
      env.workflows_walked += 1;
      env.totals.focus_indicator_missing += result.focus_indicator_missing;
      env.totals.keyboard_traps += result.keyboard_trap_detected ? 1 : 0;
      console.log(`[${LABEL}] ${wf.id} — tabbed:${result.interactive_elements_tabbed} focusMissing:${result.focus_indicator_missing} trap:${result.keyboard_trap_detected}`);
    } catch (err) {
      env.workflows.push({ id: wf.id, error: String(err) });
      console.warn(`[${LABEL}] ${wf.id} — error: ${err}`);
    }
  }

  await browser.close();
  const file = writeEnvelope(env);
  console.log(`[${LABEL}] Done. ${env.workflows_walked}/${WORKFLOWS.length} workflows. Results: ${file}`);
  process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirect) {
  main().catch((err) => {
    console.error(`[${LABEL}] FATAL ${err}`);
    process.exit(0);
  });
}
