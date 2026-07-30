#!/usr/bin/env node
/**
 * Banking Full Audit — empty Relay tab must not imply no fuel spend.
 *
 * BANK-SURF-05 (claim 1802): once account-tiles enrich is_relay_wallet / system_purpose,
 * the old "unproven / cannot identify" banner is replaced by:
 *   - wallet tiles + Open wallet register when CoA-bound, OR
 *   - banking-relay-no-wallet-bound-notice (honest: no ledger bind for this opco)
 * Either path still refuses "no fuel spend" theater and keeps a for-review escape hatch.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const home = fs.readFileSync(`${root}/apps/frontend/src/pages/banking/BankingHome.tsx`, "utf8");

  const identityWired =
    home.includes("is_relay_wallet") &&
    home.includes("relay_fuel_wallet") &&
    (home.includes('data-testid="banking-relay-no-wallet-bound-notice"') ||
      home.includes("Open wallet register"));

  const legacyUnproven = home.includes('data-testid="banking-relay-entry-unproven-banner"');

  if (!identityWired && !legacyUnproven) {
    failures.push(
      "Relay tab must either wire CoA identity (is_relay_wallet / relay_fuel_wallet + no-wallet-bound|Open wallet register) or keep the unproven banner"
    );
  }

  if (identityWired) {
    if (home.includes("Plaid mapping under Plaid Connections")) {
      failures.push("identity-wired Relay empty must not blame Plaid tags/mapping");
    }
    if (!home.includes("Open for-review queue") && !home.includes("Open Transactions")) {
      failures.push("identity-wired Relay empty/actions must keep Transactions / for-review escape hatch");
    }
  } else if (legacyUnproven) {
    if (!home.includes('not "no fuel spend.')) {
      failures.push("banner must refuse no-fuel-spend implication");
    }
    if (!home.includes("Open for-review queue")) {
      failures.push("banner must offer for-review queue action");
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-relay-");
  fs.mkdirSync(`${tmp}/apps/frontend/src/pages/banking`, { recursive: true });

  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `is_relay_wallet\nrelay_fuel_wallet\ndata-testid="banking-relay-no-wallet-bound-notice"\nOpen for-review queue\nOpen wallet register\n`
  );
  if (run(tmp).length) throw new Error(`PASS identity fail: ${run(tmp).join("; ")}`);

  fs.writeFileSync(
    `${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`,
    `data-testid="banking-relay-entry-unproven-banner"\nnot "no fuel spend."\nOpen for-review queue\n`
  );
  if (run(tmp).length) throw new Error(`PASS legacy fail: ${run(tmp).join("; ")}`);

  fs.writeFileSync(`${tmp}/apps/frontend/src/pages/banking/BankingHome.tsx`, "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-relay-entry-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-relay-entry-honesty — OK");
}
