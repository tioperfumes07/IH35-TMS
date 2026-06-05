#!/usr/bin/env node
/**
 * CLOSURE-19-SEC-AUDIT — Secrets scan (bundles + optional gitleaks history).
 * Documents findings; does NOT auto-fix or rewrite git history.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "sec-audit-secrets-scan";

const SECRET_PATTERNS = [
  { id: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "stripe_live", regex: /\bsk_live_[0-9a-zA-Z]{16,}\b/g },
  { id: "stripe_test", regex: /\bsk_test_[0-9a-zA-Z]{16,}\b/g },
  { id: "postgres_url", regex: /postgres(?:ql)?:\/\/[^\s"'`]+/gi },
  { id: "mongodb_url", regex: /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi },
  { id: "jwt_compact", regex: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
  { id: "private_key_pem", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: "slack_token", regex: /\bxox[baprs]-[0-9A-Za-z-]{10,}\b/g },
  { id: "github_pat", regex: /\bghp_[0-9a-zA-Z]{20,}\b/g },
];

function listJsFilesRecursive(dirPath) {
  if (!fs.existsSync(dirPath)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const full = path.join(dirPath, entry.name);
    if (entry.isDirectory()) out.push(...listJsFilesRecursive(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function isLikelyFalsePositive(snippet, patternId) {
  if (patternId === "jwt_compact" && snippet.includes("eyJhbGciOi") && snippet.length < 120) return true;
  return /localhost|127\.0\.0\.1|example\.com|\[REDACTED\]|placeholder/i.test(snippet);
}

function scanTextForSecrets(text, fileLabel) {
  const findings = [];
  for (const pattern of SECRET_PATTERNS) {
    pattern.regex.lastIndex = 0;
    let match;
    while ((match = pattern.regex.exec(text)) !== null) {
      const snippet = match[0].slice(0, 80);
      if (isLikelyFalsePositive(snippet, pattern.id)) continue;
      findings.push({ file: fileLabel, pattern: pattern.id, snippet });
    }
  }
  return findings;
}

function scanBundleRoots() {
  const roots = [
    { label: "frontend", dir: path.join(ROOT, "apps/frontend/dist") },
    { label: "driver-pwa", dir: path.join(ROOT, "apps/driver-pwa/dist") },
    { label: "backend", dir: path.join(ROOT, "apps/backend/dist") },
    { label: "backend-root-dist", dir: path.join(ROOT, "dist") },
  ];

  const findings = [];
  const scanned = [];

  for (const { label, dir } of roots) {
    if (!fs.existsSync(dir)) {
      scanned.push({ label, dir: path.relative(ROOT, dir), status: "missing" });
      continue;
    }
    const files = listJsFilesRecursive(dir);
    scanned.push({ label, dir: path.relative(ROOT, dir), status: "scanned", files: files.length });
    for (const file of files) {
      findings.push(...scanTextForSecrets(fs.readFileSync(file, "utf8"), path.relative(ROOT, file)));
    }
  }

  return { findings, scanned };
}

function runGitleaks() {
  const res = spawnSync("gitleaks", ["detect", "--source", ROOT, "--no-git", "-v"], {
    encoding: "utf8",
    cwd: ROOT,
  });
  if (res.error?.code === "ENOENT") {
    return { status: "skipped", reason: "gitleaks not installed" };
  }
  if (res.status !== 0) {
    return { status: "findings", stdout: (res.stdout || "").trim(), stderr: (res.stderr || "").trim() };
  }
  return { status: "clean", stdout: (res.stdout || "").trim() };
}

function main() {
  const bundleReport = scanBundleRoots();
  const gitleaksReport = runGitleaks();

  const report = {
    bundle_scan: {
      scanned: bundleReport.scanned,
      finding_count: bundleReport.findings.length,
      findings: bundleReport.findings,
    },
    gitleaks: gitleaksReport,
    remediation_policy: "Document only — Jorge must approve any secret rotation commit",
  };

  console.log(JSON.stringify(report, null, 2));

  if (bundleReport.findings.length > 0) {
    console.warn(`[${LABEL}] WARN: ${bundleReport.findings.length} potential secret pattern(s) in bundles`);
    console.error(`[${LABEL}] FAIL: secrets detected in production bundle artifacts`);
    process.exit(1);
  }

  if (gitleaksReport.status === "findings") {
    console.warn(`[${LABEL}] WARN: gitleaks reported findings — review SEC-AUDIT artifact; no auto-fix`);
  }

  console.log(`[${LABEL}] PASS (no secrets in scanned bundles)`);
}

main();
