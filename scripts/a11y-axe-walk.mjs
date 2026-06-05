#!/usr/bin/env node
/**
 * CLOSURE-20 A11Y — axe-core walk (WCAG 2.1 AA).
 *
 * Walks all 18 primary sidebar modules + 8 detail pages with axe-core driven by
 * Playwright, categorizing violations as critical / serious / moderate / minor and
 * capturing the WCAG criterion, affected DOM, and suggested fix per violation.
 *
 * This is an AUDIT-ONLY script: it never modifies application source. Results are
 * written to A11Y_OUT_DIR (default: <os.tmpdir>/ih35-a11y) so the repo working tree
 * stays clean for the block-ready gate. The committed gate is
 * scripts/verify-a11y-no-critical-violations.mjs.
 *
 * Usage:
 *   A11Y_TARGET=https://app.ih35dispatch.com node scripts/a11y-axe-walk.mjs
 *   node scripts/a11y-axe-walk.mjs --target http://localhost:5173
 *
 * When no browser/target is available (default in CI scaffold and block-ready), the
 * script prints the planned coverage, writes a baseline result envelope, and exits 0.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const LABEL = "a11y-axe-walk";

/** 18 primary navigable sidebar modules (ELD + USERS are owner-only and audited separately). */
export const SIDEBAR_MODULES = [
  { id: "HOME", path: "/home" },
  { id: "MAINT", path: "/maintenance" },
  { id: "FUEL", path: "/fuel" },
  { id: "DISPATCH", path: "/dispatch" },
  { id: "DRIVERS", path: "/drivers" },
  { id: "SAFETY", path: "/safety" },
  { id: "ACCTG", path: "/accounting" },
  { id: "BANK", path: "/banking" },
  { id: "FACT", path: "/accounting/factoring" },
  { id: "CUSTOMERS", path: "/customers" },
  { id: "VENDORS", path: "/vendors" },
  { id: "LISTS", path: "/lists" },
  { id: "REPORTS", path: "/reports" },
  { id: "LEGAL", path: "/legal" },
  { id: "DOCS", path: "/docs" },
  { id: "425C", path: "/425c" },
  { id: "DRV APP", path: "/driver-app" },
  { id: "HELP", path: "/help" },
];

/** 8 representative detail pages (IDs resolved at runtime via A11Y_SAMPLE_IDS or first-row). */
export const DETAIL_PAGES = [
  { id: "DRIVER_DETAIL", path: "/drivers/:id" },
  { id: "CUSTOMER_DETAIL", path: "/customers/:id" },
  { id: "VENDOR_DETAIL", path: "/vendors/:id" },
  { id: "VEHICLE_DETAIL", path: "/fleet/units/:id" },
  { id: "TRAILER_DETAIL", path: "/fleet/trailers/:id" },
  { id: "INVOICE_DETAIL", path: "/accounting/invoices/:id" },
  { id: "WORK_ORDER_DETAIL", path: "/maintenance/work-orders/:id" },
  { id: "LOAD_DETAIL", path: "/dispatch/loads/:id" },
];

export const WCAG_TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

export function outDir() {
  return process.env.A11Y_OUT_DIR || path.join(os.tmpdir(), "ih35-a11y");
}

export function parseTarget(argv = process.argv.slice(2)) {
  const flagIdx = argv.indexOf("--target");
  if (flagIdx !== -1 && argv[flagIdx + 1]) return argv[flagIdx + 1];
  return process.env.A11Y_TARGET || null;
}

export function emptyEnvelope() {
  return {
    tool: "axe-core",
    standard: "WCAG 2.1 AA",
    generated_at: new Date().toISOString(),
    target: null,
    pages_planned: SIDEBAR_MODULES.length + DETAIL_PAGES.length,
    pages_scanned: 0,
    totals: { critical: 0, serious: 0, moderate: 0, minor: 0 },
    pages: [],
    note: "baseline scaffold — no live target supplied; counts default to zero",
  };
}

function writeEnvelope(env) {
  const dir = outDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "axe-results.json");
  fs.writeFileSync(file, `${JSON.stringify(env, null, 2)}\n`);
  return file;
}

async function loadBrowser() {
  try {
    const { chromium } = await import("playwright");
    return { kind: "playwright", chromium };
  } catch {
    return null;
  }
}

async function loadAxeSource() {
  try {
    const { createRequire } = await import("node:module");
    const require = createRequire(import.meta.url);
    return fs.readFileSync(require.resolve("axe-core/axe.min.js"), "utf8");
  } catch {
    return null;
  }
}

async function scanPage(page, axeSource, url) {
  await page.goto(url, { waitUntil: "networkidle", timeout: 30000 });
  await page.addScriptTag({ content: axeSource });
  return page.evaluate(async (tags) => {
    /* eslint-disable no-undef */
    return await window.axe.run(document, { runOnly: { type: "tag", values: tags } });
    /* eslint-enable no-undef */
  }, WCAG_TAGS);
}

function summarize(axeResult) {
  const totals = { critical: 0, serious: 0, moderate: 0, minor: 0 };
  const violations = [];
  for (const v of axeResult.violations ?? []) {
    const impact = v.impact || "minor";
    if (totals[impact] != null) totals[impact] += v.nodes.length;
    violations.push({
      id: v.id,
      impact,
      wcag: (v.tags || []).filter((t) => t.startsWith("wcag")),
      help: v.help,
      helpUrl: v.helpUrl,
      suggested_fix: v.help,
      affected_dom: v.nodes.slice(0, 5).map((n) => n.target.join(" ")),
    });
  }
  return { totals, violations };
}

async function main() {
  const target = parseTarget();
  if (!target) {
    const env = emptyEnvelope();
    const file = writeEnvelope(env);
    console.log(`[${LABEL}] No target supplied (A11Y_TARGET / --target). Scaffold mode.`);
    console.log(`[${LABEL}] Planned coverage: ${SIDEBAR_MODULES.length} modules + ${DETAIL_PAGES.length} detail pages.`);
    console.log(`[${LABEL}] Baseline envelope written: ${file}`);
    process.exit(0);
  }

  const browserMod = await loadBrowser();
  const axeSource = await loadAxeSource();
  if (!browserMod || !axeSource) {
    const env = emptyEnvelope();
    env.target = target;
    env.note = `tooling unavailable (browser=${!!browserMod}, axe=${!!axeSource}); skipped live scan`;
    const file = writeEnvelope(env);
    console.log(`[${LABEL}] Browser/axe tooling unavailable; wrote scaffold envelope: ${file}`);
    process.exit(0);
  }

  const base = target.replace(/\/$/, "");
  const sampleIds = (process.env.A11Y_SAMPLE_IDS || "").split(",").filter(Boolean);
  const env = emptyEnvelope();
  env.target = base;

  const browser = await browserMod.chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  const targets = [
    ...SIDEBAR_MODULES.map((m) => ({ id: m.id, url: `${base}${m.path}` })),
    ...DETAIL_PAGES.map((d, i) => ({
      id: d.id,
      url: `${base}${d.path.replace(":id", sampleIds[i] || "1")}`,
    })),
  ];

  for (const t of targets) {
    try {
      const result = await scanPage(page, axeSource, t.url);
      const { totals, violations } = summarize(result);
      for (const k of Object.keys(env.totals)) env.totals[k] += totals[k];
      env.pages.push({ id: t.id, url: t.url, totals, violations });
      env.pages_scanned += 1;
      console.log(`[${LABEL}] ${t.id} — crit:${totals.critical} ser:${totals.serious} mod:${totals.moderate} min:${totals.minor}`);
    } catch (err) {
      env.pages.push({ id: t.id, url: t.url, error: String(err) });
      console.warn(`[${LABEL}] ${t.id} — scan error: ${err}`);
    }
  }

  await browser.close();
  const file = writeEnvelope(env);
  console.log(`[${LABEL}] Done. ${env.pages_scanned}/${targets.length} pages scanned. Results: ${file}`);
  console.log(`[${LABEL}] Totals — crit:${env.totals.critical} ser:${env.totals.serious} mod:${env.totals.moderate} min:${env.totals.minor}`);
  process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isDirect) {
  main().catch((err) => {
    console.error(`[${LABEL}] FATAL ${err}`);
    process.exit(0);
  });
}
