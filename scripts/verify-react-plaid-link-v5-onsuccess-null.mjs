#!/usr/bin/env node
/**
 * react-plaid-link v5: PlaidLinkOnSuccess public_token is `string | null`.
 * Handlers that type publicToken as bare `string` fail tsc under strictFunctionTypes.
 * Both Link + Reconnect must accept null and refuse before exchange.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-react-plaid-link-v5-onsuccess-null";

const TARGETS = [
  "apps/frontend/src/components/banking/PlaidLinkButton.tsx",
  "apps/frontend/src/pages/banking/components/PlaidReconnectButton.tsx",
];

function fail(message) {
  console.error(`${LABEL} FAIL: ${message}`);
  process.exit(1);
}

function assertSource(rel, src) {
  const problems = [];
  if (!/onSuccess:\s*\(\s*publicToken:\s*string\s*\|\s*null/.test(src)) {
    problems.push(`${rel}: onSuccess must type publicToken as string | null (react-plaid-link v5 PlaidLinkOnSuccess)`);
  }
  if (!/if\s*\(\s*!publicToken\s*\)/.test(src)) {
    problems.push(`${rel}: must refuse null publicToken before exchangePlaidPublicToken`);
  }
  if (/onSuccess:\s*\(\s*publicToken:\s*string\s*[,)]/.test(src) && !/string\s*\|\s*null/.test(src)) {
    problems.push(`${rel}: bare string publicToken is incompatible with v5 (strictFunctionTypes)`);
  }
  return problems;
}

function selftest() {
  const good = `
    onSuccess: (publicToken: string | null) => {
      if (!publicToken) { return; }
      void exchangePlaidPublicToken(publicToken, oc);
    }
  `;
  const bare = `onSuccess: (publicToken: string) => { void exchangePlaidPublicToken(publicToken, oc); }`;
  const noGuard = `
    onSuccess: (publicToken: string | null) => {
      void exchangePlaidPublicToken(publicToken as string, oc);
    }
  `;
  const failures = [];
  if (assertSource("good", good).length) failures.push("good fixture rejected");
  if (!assertSource("bare", bare).some((p) => p.includes("string | null"))) {
    failures.push("bare string not caught");
  }
  if (!assertSource("noGuard", noGuard).some((p) => p.includes("refuse null"))) {
    failures.push("missing null refuse not caught");
  }
  if (failures.length) {
    console.error(`${LABEL} SELFTEST FAILED:`);
    for (const f of failures) console.error(`  ${f}`);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS`);
}

if (process.argv.includes("--selftest")) {
  selftest();
  process.exit(0);
}

const allProblems = [];
for (const rel of TARGETS) {
  const abs = path.join(ROOT, rel);
  if (!fs.existsSync(abs)) fail(`missing ${rel}`);
  allProblems.push(...assertSource(rel, fs.readFileSync(abs, "utf8")));
}

if (allProblems.length) {
  console.error(`${LABEL} FAIL:`);
  for (const p of allProblems) console.error(`  ${p}`);
  process.exit(1);
}

console.log(`${LABEL} PASS — Link + Reconnect accept string | null and refuse before exchange`);
