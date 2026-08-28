#!/usr/bin/env node
/**
 * GUARD — verify-banking-plaid-connections-excludes-non-plaid-accounts
 *
 * THE DEFECT THIS ASSERTS — live-verified 2026-08-28 (Neon prod, USMCA, `SET
 * app.operating_company_id`): `banking.bank_accounts` holds a row ("Relay Fuel Wallet",
 * `sync_status='active'`, `is_active=true`) with BOTH `plaid_item_id` and `plaid_access_token`
 * NULL — it was never Plaid-connected; it syncs through a separate internal mechanism (see
 * `internal-wallet-balance.ts`, GAP-45). Before this fix, `BankingPlaidConnectionsPanel.tsx`
 * grouped every account returned by `getPlaidBankAccounts` (a generic "all bank accounts" list,
 * not Plaid-only) with `groupByPlaidItem`'s `noid:${id}` fallback catching the null-item_id row and
 * rendering it as a connection: `lead.institution_name || "Institution"` produced a fake bank name,
 * and `derivePlaidConnectionBadgeLabel` — which has no branch for "not a Plaid account" — fell
 * through to `if (!lastSyncMs) return "Never synced"`, painted in the same red used for a genuinely
 * broken feed. Worse, because a `noid:` group's `itemId` is null, the actions block
 * (`canConnect && itemId ? ... : null`) never renders Reconnect/Sync now — so the panel showed a
 * permanently red, unexplained, unfixable "Never synced" connection for an account the user never
 * connected to Plaid and has no button to do anything about.
 *
 * WHAT IS ASSERTED: the panel filters its account source to real Plaid-linked accounts
 * (`plaid_item_id` present) BEFORE grouping/rendering — a non-Plaid account (Relay Fuel Wallet and
 * any future internal wallet with the same shape) is simply absent from this panel, not shown as a
 * broken one. It remains visible everywhere else (Accounts tab tiles, transactions, account detail)
 * — this guard only scopes the Plaid-connections-management surface.
 *
 * METHOD: comments/strings stripped before structural assertions. --selftest mutates the REAL
 * source and requires the assertion to trip.
 */
import { readFileSync } from "node:fs";

const LABEL = "verify-banking-plaid-connections-excludes-non-plaid-accounts";
const FILE = "apps/frontend/src/pages/banking/components/BankingPlaidConnectionsPanel.tsx";

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/`(?:\\[\s\S]|[^\\`])*`/g, "``")
    .replace(/"(?:\\.|[^"\\])*"/g, '""')
    .replace(/'(?:\\.|[^'\\])*'/g, "''");
}

function check(sources) {
  const errors = [];
  const raw = sources[FILE] ?? "";
  if (!raw) {
    errors.push(`${FILE}: missing — cannot verify the Plaid-connections filter exists at all.`);
    return errors;
  }
  const src = stripCommentsAndStrings(raw);

  // 1. A plaid-linked filter must exist, keyed on plaid_item_id, applied to the source feeding groups.
  const filterMatch = src.match(/const\s+(\w+)\s*=\s*useMemo\(\s*\(\)\s*=>\s*(\w+)\.filter\(\s*\(\s*\w+\s*\)\s*=>\s*Boolean\(\s*\w+\.plaid_item_id/);
  if (!filterMatch) {
    errors.push(
      `${FILE}: no plaid_item_id-keyed filter feeding the connections list — a non-Plaid account ` +
        `(e.g. Relay Fuel Wallet, plaid_item_id IS NULL) will fall into groupByPlaidItem's noid: ` +
        `fallback and render as a fake, unfixable, permanently-red "Never synced" Plaid connection.`
    );
    return errors;
  }
  const filteredVarName = filterMatch[1];

  // 2. groupByPlaidItem must consume the FILTERED variable, not the raw pre-filter source.
  if (!new RegExp(`groupByPlaidItem\\(\\s*${filteredVarName}\\s*\\)`).test(src)) {
    errors.push(
      `${FILE}: groupByPlaidItem is not called with the plaid-linked-filtered variable ` +
        `(${filteredVarName}) — the filter exists but is disconnected from the group build, so ` +
        `non-Plaid accounts still reach the rendered list.`
    );
  }

  return errors;
}

function loadAll() {
  const out = {};
  try {
    out[FILE] = readFileSync(FILE, "utf8");
  } catch {
    out[FILE] = "";
  }
  return out;
}

function selftest() {
  const real = loadAll();
  const baseline = check(real);
  if (baseline.length) {
    console.error(`${LABEL} --selftest FAIL — real source does not pass:`);
    for (const e of baseline) console.error(`  - ${e}`);
    process.exit(1);
  }
  const mutations = [
    ["filter deleted (groups built straight from filteredSource again)", (s) => ({
      ...s,
      [FILE]: s[FILE].replace(
        /const plaidLinkedSource = useMemo\(\s*\(\)\s*=>[\s\S]*?\[filteredSource\]\s*\);\n\n\s*const groups = useMemo\(\(\) => groupByPlaidItem\(plaidLinkedSource\)/,
        "const groups = useMemo(() => groupByPlaidItem(filteredSource)"
      ),
    })],
    ["filter condition weakened to always-true", (s) => ({
      ...s,
      [FILE]: s[FILE].replace("Boolean(a.plaid_item_id && a.plaid_item_id.trim().length > 0)", "true"),
    })],
  ];
  for (const [name, mutate] of mutations) {
    const broken = mutate(real);
    if (JSON.stringify(broken) === JSON.stringify(real)) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" changed nothing (guard is stale).`);
      process.exit(1);
    }
    if (check(broken).length === 0) {
      console.error(`${LABEL} --selftest FAIL — mutation "${name}" was NOT detected.`);
      process.exit(1);
    }
  }
  console.log(`${LABEL} --selftest PASS — ${mutations.length} mutations all detected.`);
  process.exit(0);
}

if (process.argv.includes("--selftest")) selftest();

const errors = check(loadAll());
if (errors.length) {
  console.error(`${LABEL} FAIL — ${errors.length} problem(s):`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log(
  `${LABEL} PASS — the Plaid connections panel only lists accounts that actually went through ` +
    `Plaid; a non-Plaid internal wallet (Relay Fuel Wallet) can no longer render as a fake, ` +
    `unfixable, permanently-red "Never synced" connection.`
);
