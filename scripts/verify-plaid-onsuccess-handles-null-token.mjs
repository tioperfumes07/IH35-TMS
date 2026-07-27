#!/usr/bin/env node
/**
 * verify-plaid-onsuccess-handles-null-token
 *
 * THE DEFECT. react-plaid-link v5.0.0 widened its success callback:
 *   v4  PlaidLinkOnSuccess = (public_token: string,        metadata) => void
 *   v5  PlaidLinkOnSuccess = (public_token: string | null, metadata) => void
 * (read from the published .d.ts of both versions, not from a changelog.) That is not a typing
 * nuisance — it is Plaid stating that Link can now COMPLETE WITHOUT A PUBLIC TOKEN. Both of this
 * app's handlers declared `publicToken: string` and passed whatever arrived straight into
 * exchangePlaidPublicToken, so the honest fix is a null check, never a cast.
 *
 * WHY A CAST WOULD HAVE BEEN THE WORST OUTCOME. `as string` or `!` silences TS2345 in one character
 * and compiles clean. The app would then POST a null token to the bank-connection exchange endpoint
 * and render a generic failure with no cause. On the RECONNECT path it is worse than cosmetic: the
 * operator is repairing a broken bank feed, and a silent no-op leaves them believing a feed that is
 * still dead was restored — which is how reconciliation quietly runs on stale data.
 *
 * This guard therefore asserts BOTH halves: the widened parameter type AND a real early-return
 * before the exchange call. Type-only compliance with a cast is explicitly flagged.
 *
 * Usage: node scripts/verify-plaid-onsuccess-handles-null-token.mjs [--selftest]
 */
import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

export const PLAID_HANDLERS = [
  "apps/frontend/src/components/banking/PlaidLinkButton.tsx",
  "apps/frontend/src/pages/banking/components/PlaidReconnectButton.tsx",
];

const EXCHANGE_FN = "exchangePlaidPublicToken";

export function handlerProblems(path, src) {
  const out = [];

  // Scan ONLY the Plaid config object. PlaidLinkButton also has a COMPONENT PROP named onSuccess
  // — `onSuccess: (accounts: PlaidBankAccount[]) => void` — declared above the config, and matching
  // that instead produced a confident, entirely wrong finding against the corrected file. Anchor on
  // `token:` (the config's first key) so the prop can never be mistaken for the callback.
  const configStart = src.search(/token:\s*\w+/);
  const scope = configStart === -1 ? src : src.slice(configStart);

  const onSuccess = scope.match(/onSuccess:\s*\(\s*(\w+)\s*:\s*([^,)]+)/);
  if (!onSuccess) {
    out.push(`${path}: no onSuccess handler found in the Plaid config — if the binding moved, repoint this guard rather than deleting it`);
    return out;
  }

  const [, paramName, paramType] = onSuccess;
  if (!/string\s*\|\s*null|null\s*\|\s*string/.test(paramType)) {
    out.push(
      `${path}: onSuccess declares '${paramName}: ${paramType.trim()}' — react-plaid-link v5 passes 'string | null'. Narrowing the parameter is how a null public token reaches ${EXCHANGE_FN}.`
    );
  }

  // A cast anywhere near the exchange call defeats the point of the widened type.
  const exchangeCall = scope.match(new RegExp(`${EXCHANGE_FN}\\s*\\(([^,)]+)`));
  if (exchangeCall && /\bas\s+string\b|!\s*$/.test(exchangeCall[1].trim())) {
    out.push(
      `${path}: ${EXCHANGE_FN} is called with a cast/non-null assertion ('${exchangeCall[1].trim()}') — that silences the compiler while still sending a null token to the bank-connection endpoint`
    );
  }

  // The runtime half: an early return guarding the token BEFORE the exchange call.
  const guardIdx = scope.search(new RegExp(`if\\s*\\(\\s*!\\s*${paramName}\\s*\\)`));
  // Must find the CALL, not the import at the top of the file — the import always precedes the null
  // check, which made a correctly-ordered guard look like it ran after the exchange.
  const exchangeIdx = scope.search(new RegExp(`${EXCHANGE_FN}\\s*\\(`));
  if (guardIdx === -1) {
    out.push(
      `${path}: no 'if (!${paramName})' check — the widened type is handled on paper only; a null token would still be exchanged`
    );
  } else if (exchangeIdx !== -1 && guardIdx > exchangeIdx) {
    out.push(`${path}: the null check appears AFTER the ${EXCHANGE_FN} call — it cannot prevent the bad request`);
  }

  return out;
}

function read(p) {
  const abs = resolve(process.cwd(), p);
  if (!existsSync(abs)) {
    console.error(`FAIL: ${p} not found — if it moved, update this guard rather than deleting the check`);
    process.exit(1);
  }
  return readFileSync(abs, "utf8");
}

function run() {
  const problems = PLAID_HANDLERS.flatMap((p) => handlerProblems(p, read(p)));
  if (problems.length) {
    console.error(`[verify-plaid-onsuccess-handles-null-token] FAILED — ${problems.length} issue(s):`);
    for (const p of problems) console.error(`  ✗ ${p}`);
    return false;
  }
  console.log(
    `[verify-plaid-onsuccess-handles-null-token] OK — both Plaid handlers accept 'string | null' and refuse the exchange on a null token instead of casting it away`
  );
  return true;
}

function selftest() {
  let ok = true;
  const real = PLAID_HANDLERS.map((p) => ({ path: p, src: read(p) }));

  if (real.flatMap(({ path, src }) => handlerProblems(path, src)).length) {
    console.error("SELFTEST FAIL: the real fixed sources are flagged — false positive");
    ok = false;
  } else {
    console.log("SELFTEST: fixed sources not flagged — OK");
  }

  const base = real[1].src; // PlaidReconnectButton — the smaller handler
  const cases = [
    ["v4 narrow param restored", base.replace(/onSuccess:\s*\(\s*publicToken\s*:\s*string\s*\|\s*null/, "onSuccess: (publicToken: string"), true],
    ["null check deleted", base.replace(/if \(!publicToken\) \{[\s\S]*?\n        \}\n/, ""), true],
    ["cast instead of a check", base
      .replace(/onSuccess:\s*\(\s*publicToken\s*:\s*string\s*\|\s*null/, "onSuccess: (publicToken: string | null")
      .replace(/if \(!publicToken\) \{[\s\S]*?\n        \}\n/, "")
      .replace(/exchangePlaidPublicToken\(publicToken/, "exchangePlaidPublicToken(publicToken as string"), true],
    ["untouched", base, false],
  ];

  for (const [name, src, shouldFlag] of cases) {
    if (src === base && shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' did not mutate the source — the case cannot fail, so it proves nothing`);
      ok = false;
      continue;
    }
    const flagged = handlerProblems("fixture.tsx", src).length > 0;
    if (flagged !== shouldFlag) {
      console.error(`SELFTEST FAIL: '${name}' expected flagged=${shouldFlag}, got ${flagged}`);
      ok = false;
    } else {
      console.log(`SELFTEST: '${name}' -> flagged=${flagged} as expected`);
    }
  }

  if (!ok) process.exit(1);
  console.log("SELFTEST PASS");
}

if (process.argv.includes("--selftest")) selftest();
else process.exit(run() ? 0 : 1);
