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

export function assertSource(rel, src) {
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

  // A cast satisfies the compiler while reintroducing the exact bug: `as string` / `!` clears TS2345
  // in one character and then POSTs a null token to the bank-connection exchange endpoint. The
  // widened type is only worth anything if the value is actually checked, so type-level compliance
  // achieved by casting is flagged explicitly.
  const exchangeArg = src.match(/exchangePlaidPublicToken\s*\(([^,)]+)/);
  if (exchangeArg && /\bas\s+string\b|!\s*$/.test(exchangeArg[1].trim())) {
    problems.push(
      `${rel}: exchangePlaidPublicToken is called with a cast/non-null assertion ('${exchangeArg[1].trim()}') — that silences the compiler while still sending a null token to the bank-connection endpoint`
    );
  }

  // Order matters: a null check placed after the exchange call cannot prevent the bad request.
  // Search for the CALL, not the import at the top of the file, which always precedes the check.
  const guardIdx = src.search(/if\s*\(\s*!publicToken\s*\)/);
  const callIdx = src.search(/exchangePlaidPublicToken\s*\(/);
  if (guardIdx !== -1 && callIdx !== -1 && guardIdx > callIdx) {
    problems.push(`${rel}: the null check appears AFTER the exchangePlaidPublicToken call — it cannot prevent the bad request`);
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

  // Hand-written fixtures cannot notice when the REAL files drift away from what they model, so the
  // live sources are exercised too: they must pass as-is, and each mutation of them must be caught.
  for (const rel of TARGETS) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs)) {
      failures.push(`${rel} missing — repoint this guard rather than deleting the check`);
      continue;
    }
    const real = fs.readFileSync(abs, "utf8");
    if (assertSource(rel, real).length) failures.push(`real source ${rel} flagged — false positive`);

    const mutations = [
      ["narrowed back to v4", real.replace(/(onSuccess:\s*\(\s*publicToken:\s*string)\s*\|\s*null/, "$1")],
      ["null check deleted", real.replace(/if \(!publicToken\) \{[\s\S]*?\n\s{8}\}\n/, "")],
      [
        "cast instead of a check",
        real
          .replace(/if \(!publicToken\) \{[\s\S]*?\n\s{8}\}\n/, "")
          .replace(/exchangePlaidPublicToken\(publicToken/, "exchangePlaidPublicToken(publicToken as string"),
      ],
    ];
    for (const [name, mutated] of mutations) {
      if (mutated === real) failures.push(`${rel}: mutation '${name}' changed nothing — the case cannot fail`);
      else if (!assertSource(rel, mutated).length) failures.push(`${rel}: mutation '${name}' was not caught`);
    }
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
