#!/usr/bin/env node
/**
 * BANK-F15 — Plaid syncTransactions must forward actorUserUuid into autoCategorize so CHAIN-05
 * rule matches can reach maybePostBankCategorizationToGl on admin manual sync. Webhook/cron paths
 * stay actor-less (tags only; no invented system user).
 *
 * Cursor even claim: verify-step 1840.
 *
 * Self-test: node scripts/verify-bank-f15-plaid-sync-actor.mjs --selftest
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const FILES = {
  plaid: "apps/backend/src/integrations/plaid/plaid.service.ts",
  admin: "apps/backend/src/integrations/plaid/admin.routes.ts",
  webhook: "apps/backend/src/integrations/plaid/webhook-core.ts",
};

function read(root, rel) {
  const full = path.join(root, rel);
  if (!fs.existsSync(full)) return { text: "", missing: rel };
  return { text: fs.readFileSync(full, "utf8"), missing: null };
}

function isolateSyncAddedAutoCat(plaidText) {
  const fnStart = plaidText.indexOf("export async function syncTransactions");
  if (fnStart < 0) return "";
  const slice = plaidText.slice(fnStart);
  const addedLoop = slice.indexOf("for (const transaction of syncRes.data.added)");
  if (addedLoop < 0) return "";
  const autoIdx = slice.indexOf("await autoCategorize", addedLoop);
  if (autoIdx < 0) return "";
  const end = slice.indexOf("if (matched)", autoIdx);
  return end > autoIdx ? slice.slice(autoIdx, end) : slice.slice(autoIdx, autoIdx + 400);
}

export function run(root = ROOT) {
  const failures = [];

  const plaid = read(root, FILES.plaid);
  const admin = read(root, FILES.admin);
  const webhook = read(root, FILES.webhook);

  for (const missing of [plaid.missing, admin.missing, webhook.missing].filter(Boolean)) {
    failures.push(`missing ${missing}`);
  }
  if (failures.length) return failures;

  if (!/export async function syncTransactions\s*\(\s*itemId:\s*string\s*,\s*opts\?\:\s*\{\s*actorUserUuid\?\:\s*string\s*\}\s*\)/.test(plaid.text)) {
    failures.push("syncTransactions must accept opts?: { actorUserUuid?: string }");
  }

  const addedAutoCat = isolateSyncAddedAutoCat(plaid.text);
  if (!addedAutoCat) {
    failures.push("syncTransactions added path must call autoCategorize");
  } else if (!/actorUserUuid:\s*opts\?\.\s*actorUserUuid/.test(addedAutoCat)) {
    failures.push("sync added-path autoCategorize must pass { actorUserUuid: opts?.actorUserUuid }");
  }

  if (!/maybePostBankCategorizationToGl/.test(plaid.text)) {
    failures.push("plaid.service.ts must retain maybePostBankCategorizationToGl in autoCategorize when actor present");
  }
  if (!/if\s*\(\s*opts\?\.\s*actorUserUuid\s*\)/.test(plaid.text)) {
    failures.push("autoCategorize must gate maybePostBankCategorizationToGl on opts?.actorUserUuid");
  }

  if (!/syncTransactions\s*\(\s*account\.plaid_item_id\s*,\s*\{\s*actorUserUuid:\s*user\.uuid\s*\}\s*\)/.test(admin.text)) {
    failures.push("admin plaid sync must call syncTransactions(itemId, { actorUserUuid: user.uuid })");
  }

  if (!/await syncTransactions\(itemId\)/.test(webhook.text)) {
    failures.push("webhook must call syncTransactions(itemId) without actor (actor-less path)");
  }
  if (!/BANK-F15|no authenticated user|actor-less|no invented system user/i.test(webhook.text)) {
    failures.push("webhook-core must document BANK-F15 actor-less sync (comment)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "verify-bank-f15-"));
  for (const rel of Object.values(FILES)) {
    const src = path.join(ROOT, rel);
    const dest = path.join(tmp, rel);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, fs.readFileSync(src, "utf8"));
  }

  if (run(tmp).length) {
    throw new Error(`PASS case failed: ${run(tmp).join("; ")}`);
  }

  // Mutation: admin drops actor — guard must FAIL.
  const adminPath = path.join(tmp, FILES.admin);
  const adminOrig = fs.readFileSync(adminPath, "utf8");
  fs.writeFileSync(
    adminPath,
    adminOrig.replace(
      /syncTransactions\s*\(\s*account\.plaid_item_id\s*,\s*\{\s*actorUserUuid:\s*user\.uuid\s*\}\s*\)/,
      "syncTransactions(account.plaid_item_id)"
    )
  );
  const adminFails = run(tmp);
  if (!adminFails.some((f) => f.includes("admin plaid sync"))) {
    throw new Error(`admin actor mutation not detected: ${adminFails.join("; ")}`);
  }

  // Mutation: sync added path drops actor opts wiring — guard must FAIL.
  fs.writeFileSync(adminPath, adminOrig);
  const plaidPath = path.join(tmp, FILES.plaid);
  const plaidOrig = fs.readFileSync(plaidPath, "utf8");
  fs.writeFileSync(
    plaidPath,
    plaidOrig.replace(/\{\s*actorUserUuid:\s*opts\?\.\s*actorUserUuid\s*\}/, "{}")
  );
  const syncFails = run(tmp);
  if (!syncFails.some((f) => f.includes("added-path autoCategorize"))) {
    throw new Error(`sync actor opts mutation not detected: ${syncFails.join("; ")}`);
  }

  // Mutation: remove maybePostBankCategorizationToGl gate — structural poster path must FAIL.
  fs.writeFileSync(plaidPath, plaidOrig);
  fs.writeFileSync(
    plaidPath,
    plaidOrig.replace(/if\s*\(\s*opts\?\.\s*actorUserUuid\s*\)/, "if (false /* selftest */)")
  );
  const posterFails = run(tmp);
  if (!posterFails.some((f) => f.includes("maybePostBankCategorizationToGl"))) {
    throw new Error(`poster gate mutation not detected: ${posterFails.join("; ")}`);
  }

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-f15-plaid-sync-actor --selftest OK");
} else {
  const failures = run();
  if (failures.length) {
    console.error("verify-bank-f15-plaid-sync-actor FAIL:");
    for (const f of failures) console.error(`  - ${f}`);
    process.exit(1);
  }
  console.log("verify-bank-f15-plaid-sync-actor — OK (admin sync passes actor; webhook actor-less)");
}
