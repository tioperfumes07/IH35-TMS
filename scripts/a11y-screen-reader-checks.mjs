#!/usr/bin/env node
/**
 * CLOSURE-20 A11Y — screen reader static checks (WCAG 1.1.1, 1.3.1, 2.4.6, 4.1.2).
 *
 * Static scan of apps/frontend/src (READ-ONLY) for:
 *   - icon-only buttons missing an accessible name (aria-label / aria-labelledby / title)
 *   - form fields without an associated <label> / aria-label / aria-labelledby
 *   - <img> without alt (decorative alt="" is allowed)
 *   - modal components without focus management (trap + return on close)
 *
 * AUDIT-ONLY: never modifies source. Emits a findings report to A11Y_OUT_DIR and
 * always exits 0 — gating of regressions is handled by
 * scripts/verify-a11y-no-critical-violations.mjs.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const LABEL = "a11y-screen-reader-checks";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SRC = path.join(ROOT, "apps/frontend/src");

export function outDir() {
  return process.env.A11Y_OUT_DIR || path.join(os.tmpdir(), "ih35-a11y");
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (["node_modules", "dist", "__tests__"].includes(entry.name)) continue;
      walk(full, acc);
    } else if (/\.(tsx|jsx)$/.test(entry.name) && !/\.test\.(tsx|jsx)$/.test(entry.name)) {
      acc.push(full);
    }
  }
  return acc;
}

const ICON_ONLY_HINT = /(svg|Icon|lucide|<i\s|className="[^"]*icon)/i;
const ACCESSIBLE_NAME = /(aria-label|aria-labelledby|title=|aria-hidden)/;

export function scanImages(text) {
  const findings = [];
  const re = /<img\b[^>]*>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (!/\balt\s*=/.test(m[0])) findings.push(m[0].slice(0, 80));
  }
  return findings;
}

export function scanIconButtons(text) {
  const findings = [];
  const re = /<button\b[^>]*>([\s\S]*?)<\/button>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const open = m[0].slice(0, m[0].indexOf(">") + 1);
    const inner = m[1];
    const hasText = inner.replace(/<[^>]+>/g, "").replace(/\{[^}]*\}/g, "").trim().length > 0;
    const looksIconOnly = !hasText && ICON_ONLY_HINT.test(inner);
    if (looksIconOnly && !ACCESSIBLE_NAME.test(open)) {
      findings.push(open.slice(0, 80));
    }
  }
  return findings;
}

export function scanFormFields(text) {
  const findings = [];
  const re = /<input\b[^>]*>/g;
  let m;
  while ((m = re.exec(text)) !== null) {
    const tag = m[0];
    if (/type\s*=\s*["'](hidden|submit|button|checkbox|radio)["']/.test(tag)) continue;
    if (!/(aria-label|aria-labelledby|id\s*=)/.test(tag)) {
      findings.push(tag.slice(0, 80));
    }
  }
  return findings;
}

export function scanModalFocus(filePath, text) {
  if (!/Modal/.test(path.basename(filePath))) return [];
  const managesFocus = /(focus\(\)|autoFocus|FocusTrap|trapFocus|useFocus|onKeyDown|Escape)/.test(text);
  return managesFocus ? [] : [path.relative(ROOT, filePath)];
}

function main() {
  const files = walk(SRC);
  const report = {
    check: "screen-reader-static",
    standard: "WCAG 2.1 AA (1.1.1, 1.3.1, 2.4.6, 4.1.2)",
    generated_at: new Date().toISOString(),
    files_scanned: files.length,
    totals: {
      images_missing_alt: 0,
      icon_buttons_missing_name: 0,
      inputs_missing_label: 0,
      modals_missing_focus_mgmt: 0,
    },
    findings: { images_missing_alt: [], icon_buttons_missing_name: [], inputs_missing_label: [], modals_missing_focus_mgmt: [] },
  };

  for (const file of files) {
    const text = fs.readFileSync(file, "utf8");
    const rel = path.relative(ROOT, file);
    for (const f of scanImages(text)) report.findings.images_missing_alt.push({ file: rel, snippet: f });
    for (const f of scanIconButtons(text)) report.findings.icon_buttons_missing_name.push({ file: rel, snippet: f });
    for (const f of scanFormFields(text)) report.findings.inputs_missing_label.push({ file: rel, snippet: f });
    for (const f of scanModalFocus(file, text)) report.findings.modals_missing_focus_mgmt.push({ file: f });
  }

  report.totals.images_missing_alt = report.findings.images_missing_alt.length;
  report.totals.icon_buttons_missing_name = report.findings.icon_buttons_missing_name.length;
  report.totals.inputs_missing_label = report.findings.inputs_missing_label.length;
  report.totals.modals_missing_focus_mgmt = report.findings.modals_missing_focus_mgmt.length;

  const dir = outDir();
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, "screen-reader-results.json");
  fs.writeFileSync(file, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`[${LABEL}] scanned ${files.length} component files`);
  console.log(`[${LABEL}] images missing alt:        ${report.totals.images_missing_alt}`);
  console.log(`[${LABEL}] icon buttons missing name:  ${report.totals.icon_buttons_missing_name}`);
  console.log(`[${LABEL}] inputs missing label:       ${report.totals.inputs_missing_label}`);
  console.log(`[${LABEL}] modals missing focus mgmt:  ${report.totals.modals_missing_focus_mgmt}`);
  console.log(`[${LABEL}] report: ${file}`);
  process.exit(0);
}

const isDirect = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isDirect) {
  main();
}
