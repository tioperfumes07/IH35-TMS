#!/usr/bin/env node
/** CLOSURE-19 CI guard — SEC audit artifacts present. */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-closure-19-sec-artifacts";
const REQUIRED = [
  "docs/audits/SEC-AUDIT-2026-06-05.md",
  "docs/security-baseline.md",
  "scripts/sec-audit-rls-policies.mjs",
  "scripts/sec-audit-auth-flows.mjs",
  "scripts/sec-audit-secrets-scan.mjs",
  "scripts/sec-audit-deps-cve-scan.mjs",
  "scripts/sec-audit-cors-csp.mjs",
  "scripts/verify-no-secrets-in-bundle.mjs",
  ".github/workflows/security-checks.yml",
  ".block-ready/CLOSURE-19-SEC-AUDIT.json",
];
for (const rel of REQUIRED) {
  if (!fs.existsSync(path.join(ROOT, rel))) {
    console.error(`[${LABEL}] FAIL missing ${rel}`);
    process.exit(1);
  }
}

const qboOauth = fs.readFileSync(path.join(ROOT, "apps/backend/src/integrations/qbo/qbo-oauth.service.ts"), "utf8");
if (/redirect_uri:\s*form\.get\("redirect_uri"\)|redirect_uri:\s*redirectUri,\s*\n\s*clientIdPrefix|\n\s*redirectUri,\s*\n\s*form:/.test(qboOauth)) {
  console.error(`[${LABEL}] FAIL QBO OAuth logs must expose only redirect-URI presence, never its value`);
  process.exit(1);
}
const authAudit = fs.readFileSync(path.join(ROOT, "scripts/sec-audit-auth-flows.mjs"), "utf8");
if (/console\.log\(JSON\.stringify\(report\b/.test(authAudit)) {
  console.error(`[${LABEL}] FAIL auth audit must not dump the full report into CI logs`);
  process.exit(1);
}
console.log(`[${LABEL}] PASS (${REQUIRED.length} artifacts)`);
