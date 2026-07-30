#!/usr/bin/env node
/**
 * BANK-SURF-05 — Relay wallet identity on account-tiles / Relay tab.
 *
 * ROOT CAUSE: views.banking_account_tiles.is_relay is PHANTOM (never written). Canonical identity is
 * catalogs.accounts.system_purpose = 'relay_fuel_wallet' via banking.bank_accounts.ledger_account_id.
 * After Relay ingest (#3799) works, the Relay tab still cannot open the wallet if tiles omit that bind.
 *
 * Guard asserts:
 *   G1  GET /account-tiles SQL enriches system_purpose / is_relay_wallet via ledger_account_id join
 *   G2  BankingTile type documents is_relay_wallet / system_purpose (not trust phantom is_relay)
 *   G3  Relay tab resolves wallets via is_relay_wallet / system_purpose — never .find(is_relay)
 *   G4  AccountTile styles Relay from is_relay_wallet / system_purpose, not tile.is_relay alone
 *
 * LIVE PROOF stays UNVERIFIED until browser + Neon wallet feed proof (Rule 16 / 23).
 *
 * Usage:
 *   node scripts/verify-bank-surf-05-relay-identity.mjs
 *   node scripts/verify-bank-surf-05-relay-identity.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-surf-05-relay-identity";

const ROUTES = "apps/backend/src/banking/banking.routes.ts";
const API = "apps/frontend/src/api/banking.ts";
const HOME = "apps/frontend/src/pages/banking/BankingHome.tsx";
const TILE = "apps/frontend/src/pages/banking/components/AccountTile.tsx";

const FIND_BY_IS_RELAY = /\.find\(\s*\(?[^)\n]*\)?\s*=>[^\n]*\bis_relay\b/;

/** @param {Record<string, string | null>} files */
export function check(files) {
  const f = [];

  const routes = files[ROUTES] ?? "";
  if (!routes.includes("account-tiles")) {
    f.push(`${ROUTES}: missing account-tiles route`);
  } else {
    if (!/system_purpose\s*=\s*'relay_fuel_wallet'/.test(routes) && !/relay_fuel_wallet/.test(routes)) {
      f.push(`${ROUTES}: account-tiles must join/enrich relay_fuel_wallet via catalogs.accounts.system_purpose`);
    }
    if (!/is_relay_wallet/.test(routes)) {
      f.push(`${ROUTES}: account-tiles must project is_relay_wallet`);
    }
    if (!/ledger_account_id/.test(routes)) {
      f.push(`${ROUTES}: account-tiles enrich must join via ledger_account_id`);
    }
    if (!/LEFT JOIN\s+catalogs\.accounts/i.test(routes)) {
      f.push(`${ROUTES}: account-tiles must LEFT JOIN catalogs.accounts`);
    }
  }

  const api = files[API] ?? "";
  if (!api.includes("is_relay_wallet")) {
    f.push(`${API}: BankingTile must declare is_relay_wallet`);
  }
  if (!api.includes("system_purpose")) {
    f.push(`${API}: BankingTile must declare system_purpose`);
  }
  if (api.includes("is_relay") && !api.includes("PHANTOM: never populated")) {
    f.push(`${API}: is_relay must keep PHANTOM marker`);
  }

  const home = files[HOME] ?? "";
  if (FIND_BY_IS_RELAY.test(home.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1"))) {
    f.push(`${HOME}: must not .find(... is_relay ...) — use is_relay_wallet / system_purpose`);
  }
  if (!/is_relay_wallet/.test(home) || !/relay_fuel_wallet/.test(home)) {
    f.push(`${HOME}: Relay tab must filter tiles by is_relay_wallet / system_purpose === 'relay_fuel_wallet'`);
  }
  if (!/banking-relay-no-wallet-bound-notice|Open wallet register/.test(home)) {
    f.push(`${HOME}: Relay tab must deep-link wallet register when bound, or honest no-wallet-bound empty`);
  }
  if (/Plaid mapping under Plaid Connections/.test(home) && /relay_card/.test(home)) {
    f.push(`${HOME}: Relay empty must not blame Plaid tags/mapping (config theater)`);
  }

  const tile = files[TILE] ?? "";
  if (/\btile\.is_relay\b/.test(tile.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:])\/\/[^\n]*/g, "$1"))) {
    f.push(`${TILE}: must not style off tile.is_relay — use is_relay_wallet / system_purpose`);
  }
  if (!/is_relay_wallet|relay_fuel_wallet/.test(tile)) {
    f.push(`${TILE}: must recognize Relay via is_relay_wallet / system_purpose`);
  }

  return f;
}

export function run(root = ROOT) {
  /** @type {Record<string, string | null>} */
  const files = {};
  for (const rel of [ROUTES, API, HOME, TILE]) {
    try {
      files[rel] = fs.readFileSync(path.join(root, rel), "utf8");
    } catch {
      files[rel] = null;
    }
  }
  return check(files);
}

if (process.argv.includes("--selftest")) {
  const good = {
    [ROUTES]: `
      app.get("/api/v1/banking/account-tiles", async () => {
        SELECT t.*, ba.ledger_account_id, ca.system_purpose,
          (ca.system_purpose = 'relay_fuel_wallet') AS is_relay_wallet
        FROM views.banking_account_tiles t
        LEFT JOIN banking.bank_accounts ba ON ba.id = t.id
        LEFT JOIN catalogs.accounts ca ON ca.id = ba.ledger_account_id
      });
    `,
    [API]: `/** PHANTOM: never populated */\nis_relay: boolean;\nis_relay_wallet?: boolean;\nsystem_purpose?: string | null;\n`,
    [HOME]: `
      const relayWalletTiles = tiles.filter((t) => t.is_relay_wallet === true || t.system_purpose === "relay_fuel_wallet");
      {relayWalletTiles.length === 0 ? (
        <div data-testid="banking-relay-no-wallet-bound-notice">No wallet</div>
      ) : (
        <ActionButton>Open wallet register</ActionButton>
      )}
    `,
    [TILE]: `if (tile.is_relay_wallet || tile.system_purpose === "relay_fuel_wallet") return "relay";\n`,
  };
  if (check(good).length) throw new Error(`${LABEL} selftest PASS path failed: ${check(good).join("; ")}`);

  const badFind = {
    ...good,
    [HOME]: `const relay = tiles.find((t) => t.is_relay);\n`,
  };
  if (!check(badFind).some((x) => x.includes(".find"))) {
    throw new Error(`${LABEL} selftest FAIL path did not catch phantom .find(is_relay)`);
  }

  const badRoutes = {
    ...good,
    [ROUTES]: `app.get("/api/v1/banking/account-tiles", async () => { SELECT t.* FROM views.banking_account_tiles t });`,
  };
  if (!check(badRoutes).length) throw new Error(`${LABEL} selftest FAIL path did not catch missing enrich`);

  console.log(`${LABEL} --selftest OK`);
} else {
  const f = run();
  if (f.length) {
    console.error(f.map((x) => `✗ ${x}`).join("\n"));
    process.exit(1);
  }
  console.log(`${LABEL} — OK`);
}
