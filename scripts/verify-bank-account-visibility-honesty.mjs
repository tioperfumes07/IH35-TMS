#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PAGE = "apps/frontend/src/pages/banking/BankAccountVisibilityPage.tsx";
const LABEL = "verify-bank-account-visibility-honesty";

function failures(source) {
  const errors = [];
  // Re-anchored (2026-08-20, CC-3): the page migrated its hand-rolled honest-empty-state JSX
  // (`{!query.isError ? <div` + `accounts.length === 0 && !query.isError`) to the shared
  // ParityTable component, which owns empty/loading/error state itself via its own `emptyText`
  // prop — matching the repo-wide "shared QBO-parity grammar" convention (CLAUDE.md §7). The
  // honesty invariant this guard exists to protect (never fabricate a green empty state while
  // erroring) now lives in `{query.isError ? <ListErrorBanner .../> : <ParityTable emptyText=.../>}`
  // instead.
  const required = [
    'import { entityLabel } from "../../lib/entity-label"',
    'entityLabel(account.account_name ?? account.display_name, account.id, "Account")',
    "accountLabel(account)",
    "query.isError ? (",
    'emptyText="No bank accounts for this company."',
    "<ListErrorBanner onRetry={() => void query.refetch()} />",
  ];
  for (const needle of required) if (!source.includes(needle)) errors.push(`missing ${JSON.stringify(needle)}`);
  if (/account\.account_name\s*\?\?\s*account\.display_name\s*\?\?\s*account\.id/.test(source)) {
    errors.push("raw account id remains as a display-name fallback");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = `
    import { entityLabel } from "../../lib/entity-label";
    const accountLabel = (account) => entityLabel(account.account_name ?? account.display_name, account.id, "Account");
    render: (account) => <span>{accountLabel(account)}</span>,
    {query.isError ? (
      <ListErrorBanner onRetry={() => void query.refetch()} />
    ) : (
      <ParityTable columns={columns} rows={accounts} emptyText="No bank accounts for this company." />
    )}
  `;
  if (failures(good).length) throw new Error(`${LABEL}: good fixture failed: ${failures(good).join("; ")}`);
  const mutations = [
    'import { entityLabel } from "../../lib/entity-label"',
    'entityLabel(account.account_name ?? account.display_name, account.id, "Account")',
    "accountLabel(account)",
    "query.isError ? (",
    'emptyText="No bank accounts for this company."',
    "<ListErrorBanner onRetry={() => void query.refetch()} />",
  ];
  for (const mutation of mutations) {
    if (!failures(good.replace(mutation, "MUTATED")).length) throw new Error(`${LABEL}: mutation survived: ${mutation}`);
  }
  if (!failures(good.replace(
    'entityLabel(account.account_name ?? account.display_name, account.id, "Account")',
    "account.account_name ?? account.display_name ?? account.id"
  )).length) throw new Error(`${LABEL}: raw-id mutation survived`);
  console.log(`${LABEL}: selftest PASS (${mutations.length + 1} mutations caught)`);
} else {
  const errors = failures(fs.readFileSync(path.join(ROOT, PAGE), "utf8"));
  if (errors.length) throw new Error(`${LABEL}: ${errors.join("; ")}`);
  console.log(`${LABEL}: PASS`);
}
