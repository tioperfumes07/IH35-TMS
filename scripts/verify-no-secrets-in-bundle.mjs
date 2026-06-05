#!/usr/bin/env node
/**
 * CLOSURE-19 CI guard — fail PR if secret patterns appear in frontend/driver dist/*.js.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-no-secrets-in-bundle";

const BUNDLE_ROOTS = [
  path.join(ROOT, "apps/frontend/dist"),
  path.join(ROOT, "apps/driver-pwa/dist"),
];

const SECRET_PATTERNS = [
  { id: "aws_access_key", regex: /\bAKIA[0-9A-Z]{16}\b/g },
  { id: "stripe_live", regex: /\bsk_live_[0-9a-zA-Z]{16,}\b/g },
  { id: "postgres_url", regex: /postgres(?:ql)?:\/\/[^\s"'`]+/gi },
  { id: "mongodb_url", regex: /mongodb(?:\+srv)?:\/\/[^\s"'`]+/gi },
  { id: "private_key_pem", regex: /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { id: "github_pat", regex: /\bghp_[0-9a-zA-Z]{20,}\b/g },
];

function listJsFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listJsFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".js")) out.push(full);
  }
  return out;
}

function isFalsePositive(snippet) {
  return /localhost|127\.0\.0\.1|example\.com|\[REDACTED\]|placeholder/i.test(snippet);
}

function main() {
  const findings = [];
  let filesScanned = 0;

  for (const root of BUNDLE_ROOTS) {
    if (!fs.existsSync(root)) {
      console.warn(`[${LABEL}] WARN: ${path.relative(ROOT, root)} missing — run build:frontend && build:driver-pwa in CI first`);
      continue;
    }
    for (const file of listJsFiles(root)) {
      filesScanned += 1;
      const text = fs.readFileSync(file, "utf8");
      const rel = path.relative(ROOT, file);
      for (const pattern of SECRET_PATTERNS) {
        pattern.regex.lastIndex = 0;
        let match;
        while ((match = pattern.regex.exec(text)) !== null) {
          const snippet = match[0].slice(0, 80);
          if (isFalsePositive(snippet)) continue;
          findings.push({ file: rel, pattern: pattern.id, snippet });
        }
      }
    }
  }

  if (findings.length > 0) {
    console.error(`[${LABEL}] FAIL: ${findings.length} secret pattern(s) in bundle:`);
    for (const f of findings.slice(0, 20)) {
      console.error(`  ${f.file} [${f.pattern}] ${f.snippet}`);
    }
    process.exit(1);
  }

  console.log(`[${LABEL}] PASS (${filesScanned} JS files scanned)`);
}

main();
