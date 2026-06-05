#!/usr/bin/env node
/**
 * CLOSURE-18-PERF-AUDIT — Lighthouse on production (desktop + mobile profiles).
 * Requires: npx lighthouse (installed on-demand) + FRONTEND_BASE_URL.
 */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "perf-lighthouse-on-prod";
const BUDGETS_PATH = path.join(ROOT, "docs/perf-budgets.json");
const AUDIT_PATH = path.join(ROOT, "docs/audits/PERF-AUDIT-2026-06-05.md");

const PAGES = [
  "/home",
  "/dispatch",
  "/maintenance",
  "/accounting",
  "/banking",
  "/customers",
  "/drivers",
  "/reports",
];

const PROD_DEFAULT = "https://ih35-tms-web.onrender.com";

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function writeJson(filePath, data) {
  fs.writeFileSync(filePath, `${JSON.stringify(data, null, 2)}\n`);
}

function runLighthouse(url, formFactor) {
  const outFile = path.join(ROOT, `.lighthouse-${formFactor}-${Buffer.from(url).toString("base64url").slice(0, 12)}.json`);
  const args = [
    url,
    "--quiet",
    "--chrome-flags=--headless --no-sandbox",
    `--form-factor=${formFactor}`,
    "--only-categories=performance",
    "--output=json",
    `--output-path=${outFile}`,
  ];
  const result = spawnSync("npx", ["--yes", "lighthouse@12", ...args], {
    cwd: ROOT,
    encoding: "utf8",
    timeout: 180_000,
  });
  if (result.status !== 0 || !fs.existsSync(outFile)) {
    console.warn(`[${LABEL}] WARN: lighthouse failed for ${url} (${formFactor}): ${result.stderr?.slice(0, 200)}`);
    return null;
  }
  const report = JSON.parse(fs.readFileSync(outFile, "utf8"));
  fs.unlinkSync(outFile);
  const audits = report.audits ?? {};
  return {
    performance: Math.round((report.categories?.performance?.score ?? 0) * 100),
    fcp_ms: Math.round(audits["first-contentful-paint"]?.numericValue ?? 0),
    lcp_ms: Math.round(audits["largest-contentful-paint"]?.numericValue ?? 0),
    tbt_ms: Math.round(audits["total-blocking-time"]?.numericValue ?? 0),
    cls: Number((audits["cumulative-layout-shift"]?.numericValue ?? 0).toFixed(3)),
    tti_ms: Math.round(audits.interactive?.numericValue ?? 0),
  };
}

function appendAuditSection(lines) {
  const header = "## Lighthouse Production Sweep";
  let content = fs.existsSync(AUDIT_PATH) ? fs.readFileSync(AUDIT_PATH, "utf8") : `# PERF Audit 2026-06-05\n\n`;
  if (content.includes(header)) {
    content = content.split(header)[0].trimEnd();
  }
  fs.writeFileSync(AUDIT_PATH, `${content}\n\n${header}\n\n${lines.join("\n")}\n`);
}

function main() {
  const base = (process.env.FRONTEND_BASE_URL ?? PROD_DEFAULT).replace(/\/$/, "");
  const runLive = process.env.PERF_RUN_LIGHTHOUSE === "1";

  const budgets = readJson(BUDGETS_PATH);
  const auditLines = [`Base URL: ${base}`, `Captured: ${new Date().toISOString()}`, ""];

  if (!runLive) {
    console.log(`[${LABEL}] SKIP live Lighthouse (set PERF_RUN_LIGHTHOUSE=1 to run npx lighthouse on prod)`);
    for (const page of PAGES) {
      const mobile = budgets.lighthouse_mobile?.[page];
      const desktop = budgets.lighthouse_desktop?.[page];
      if (mobile) {
        auditLines.push(`### ${page} (mobile baseline)`);
        auditLines.push(`- Performance ${mobile.performance} · FCP ${mobile.fcp_ms}ms · LCP ${mobile.lcp_ms}ms · TBT ${mobile.tbt_ms}ms · CLS ${mobile.cls}`);
      }
      if (desktop) {
        auditLines.push(`### ${page} (desktop baseline)`);
        auditLines.push(`- Performance ${desktop.performance} · FCP ${desktop.fcp_ms}ms · LCP ${desktop.lcp_ms}ms · TBT ${desktop.tbt_ms}ms · CLS ${desktop.cls}`);
      }
      auditLines.push("");
    }
    appendAuditSection(auditLines);
    return;
  }

  for (const page of PAGES) {
    const url = `${base}${page}`;
    const mobile = runLighthouse(url, "mobile");
    const desktop = runLighthouse(url, "desktop");
    if (mobile) {
      budgets.lighthouse_mobile = budgets.lighthouse_mobile ?? {};
      budgets.lighthouse_mobile[page] = mobile;
      auditLines.push(`### ${page} (mobile)`);
      auditLines.push(`- Performance ${mobile.performance} · FCP ${mobile.fcp_ms}ms · LCP ${mobile.lcp_ms}ms`);
    }
    if (desktop) {
      budgets.lighthouse_desktop = budgets.lighthouse_desktop ?? {};
      budgets.lighthouse_desktop[page] = desktop;
      auditLines.push(`### ${page} (desktop)`);
      auditLines.push(`- Performance ${desktop.performance} · FCP ${desktop.fcp_ms}ms · LCP ${desktop.lcp_ms}ms`);
    }
    auditLines.push("");
  }

  writeJson(BUDGETS_PATH, budgets);
  appendAuditSection(auditLines);
  console.log(`[${LABEL}] OK — lighthouse metrics written`);
}

main();
