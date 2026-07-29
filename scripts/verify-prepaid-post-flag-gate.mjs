#!/usr/bin/env node
/**
 * Flag-gate guard — PREPAID_EXPENSES_POST_ENABLED (UI-1 prepaid-expenses create route).
 *
 * Ground truth (verified in the source): create-time GL posting for prepaid assets IS NOW IMPLEMENTED.
 * The create route (prepaid-expenses.routes.ts) writes the asset header + amortization schedule rows and
 * — only when PREPAID_EXPENSES_POST_ENABLED is ON — capitalizes the purchase through the SHARED FIN-21
 * spine (postPrepaidPurchase: Dr prepaid asset / Cr cash-or-A/P) on the SAME transaction. Previously this
 * guard asserted the opposite posture (flag ON => hard 422 gl_posting_not_implemented); that refusal was
 * the placeholder and is gone, so the assertions below flipped from "must refuse" to "must post through
 * the shared poster, and only behind the flag".
 *
 * What is locked so the flag can be flipped ON safely:
 *   (1) the route resolves PREPAID_POST_FLAG ('PREPAID_EXPENSES_POST_ENABLED') via isEnabled();
 *   (2) posting goes through the SHARED spine — postPrepaidPurchase imported from
 *       ./amortization-posting/amortization-posting.service.js — never an ad-hoc poster in the route;
 *   (3) the route contains NO raw journal-entry write (no INSERT INTO accounting.journal_entries):
 *       the only GL writer is the shared poster, which is itself flag-gated;
 *   (4) FAIL CLOSED: with the flag ON and asset_account_id / payment_account_id missing, the create is
 *       REFUSED (gl_accounts_required) — an asset is never capitalized off-ledger;
 *   (5) the stale placeholder refusal (gl_posting_not_implemented) is GONE — a reintroduced hard refusal
 *       would silently disable the implemented poster;
 *   (6) DEFAULT OFF: the seed migration (202606271610) registers the flag with default_enabled=false.
 *
 * Protected write path: apps/backend/src/accounting/prepaid-expenses.routes.ts (create handler).
 * --selftest exercises the assertions against inline fixtures.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const ROUTE = "apps/backend/src/accounting/prepaid-expenses.routes.ts";
const MIGRATION = "db/migrations/202606271610_prepaid_expenses_data_model.sql";

function stripSql(src) {
  return src.replace(/--.*$/gm, "");
}
function seededDefaultOff(mig, key) {
  return new RegExp(`['"]${key}['"][\\s\\S]{0,600}?,\\s*false\\s*[,)]`).test(stripSql(mig));
}

export function assertPrepaid({ route, migration }) {
  const errors = [];
  if (!/PREPAID_POST_FLAG\s*=\s*["']PREPAID_EXPENSES_POST_ENABLED["']/.test(route)) {
    errors.push("route: PREPAID_POST_FLAG const ('PREPAID_EXPENSES_POST_ENABLED') missing");
  }
  const gate = route.search(/isEnabled\([^)]*PREPAID_POST_FLAG/);
  if (gate < 0) errors.push("route: create path does not resolve isEnabled(PREPAID_POST_FLAG)");

  // Posting must run through the SHARED FIN-21 spine, not a poster written inside the route.
  if (!/from\s+["']\.\/amortization-posting\/amortization-posting\.service\.js["']/.test(route)) {
    errors.push("route: must import the shared poster from ./amortization-posting/amortization-posting.service.js");
  }
  const call = route.search(/postPrepaidPurchase\s*\(/);
  if (call < 0) {
    errors.push("route: create path must call postPrepaidPurchase() — the shared, flag-gated purchase poster");
  }
  if (gate >= 0 && call >= 0 && call < gate) {
    errors.push("route: postPrepaidPurchase() must follow the isEnabled(PREPAID_POST_FLAG) resolution");
  }

  // No raw GL write in the route: the ONLY journal-entry writer is the shared (flag-gated) poster.
  if (/INSERT\s+INTO\s+accounting\.journal_entries/i.test(route)) {
    errors.push("route: contains an INSERT INTO accounting.journal_entries — the route must post only via the shared poster");
  }
  if (/postVoidReversal\s*\(|buildBillPaymentLines\s*\(|postingEngine\./.test(route)) {
    errors.push("route: invokes another posting/reversal engine — prepaid create posts only the purchase entry");
  }

  // Fail CLOSED: flag ON + missing account FKs must refuse the create, never capitalize off-ledger.
  if (!/gl_accounts_required/.test(route)) {
    errors.push("route: flag-ON path must fail CLOSED with gl_accounts_required when asset_account_id / payment_account_id are missing");
  }
  if (!/asset_account_id/.test(route) || !/payment_account_id/.test(route)) {
    errors.push("route: both asset_account_id and payment_account_id must be required for the purchase entry legs");
  }

  // The placeholder refusal must stay deleted — reintroducing it would disable the implemented poster.
  if (/gl_posting_not_implemented/.test(route)) {
    errors.push("route: gl_posting_not_implemented refusal is stale — create-time purchase posting IS implemented; the flag-ON path must post, not refuse");
  }

  if (!seededDefaultOff(migration, "PREPAID_EXPENSES_POST_ENABLED")) {
    errors.push("migration: PREPAID_EXPENSES_POST_ENABLED not seeded with default_enabled=false (DEFAULT OFF)");
  }
  return errors;
}

if (process.argv.includes("--selftest")) {
  const good = {
    route: `const PREPAID_POST_FLAG = "PREPAID_EXPENSES_POST_ENABLED";
      import { postPrepaidPurchase } from "./amortization-posting/amortization-posting.service.js";
      const postEnabled = await isEnabled(client, PREPAID_POST_FLAG, {});
      if (postEnabled && (!input.asset_account_id || !input.payment_account_id)) {
        return reply.code(422).send({ error: "gl_accounts_required" });
      }
      await client.query("INSERT INTO accounting.prepaid_assets (...) VALUES (...)");
      const purchasePosting = await postPrepaidPurchase(client, { assetId: asset.id }, { userId });`,
    migration: `INSERT INTO lib.feature_flags (flag_key, description, default_enabled)\nVALUES ('PREPAID_EXPENSES_POST_ENABLED', 'desc', false);`,
  };
  // The OLD posture (hard refusal, no poster, no fail-closed) plus a raw GL write and a flag-ON default.
  const bad = {
    route: `const OTHER = 1;
      const postEnabled = await isEnabled(client, SOMETHING_ELSE);
      if (postEnabled) { return reply.code(422).send({ error: "gl_posting_not_implemented" }); }
      await client.query("INSERT INTO accounting.journal_entries (...) VALUES (...)");`,
    migration: `INSERT INTO lib.feature_flags VALUES ('PREPAID_EXPENSES_POST_ENABLED', 'desc', true);`,
  };
  const g = assertPrepaid(good);
  const b = assertPrepaid(bad);
  if (g.length !== 0) { console.error("SELFTEST FAIL: good fixture flagged", g); process.exit(1); }
  if (b.length < 7) { console.error("SELFTEST FAIL: bad fixture under-caught", b); process.exit(1); }
  console.log("verify-prepaid-post-flag-gate selftest OK");
  process.exit(0);
}

const read = (rel) => {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) { console.error(`verify-prepaid-post-flag-gate FAIL — missing ${rel}`); process.exit(1); }
  return fs.readFileSync(p, "utf8");
};
const errors = assertPrepaid({ route: read(ROUTE), migration: read(MIGRATION) });
if (errors.length) {
  console.error("verify-prepaid-post-flag-gate FAIL — PREPAID_EXPENSES_POST_ENABLED gate broken:");
  for (const e of errors) console.error("  - " + e);
  process.exit(1);
}
console.log("verify-prepaid-post-flag-gate OK — flag-ON posts via the shared poster, fails closed on missing accounts, no raw GL write in the route, flag seeded default OFF.");
