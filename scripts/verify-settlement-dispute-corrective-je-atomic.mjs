#!/usr/bin/env node
/**
 * ACCT-F5643 — createCorrectiveJournalEntry (settlement-dispute.service.ts) used to open its OWN
 * withCurrentUser connection — a SECOND, independent DB connection — and post the corrective JE via
 * createJournalEntry() on it, even though every one of its three call sites (resolveDispute in this
 * same file, disputes.routes.ts's reviewSettlementDispute, settlement-disputes-p6.service.ts's
 * decideDispute) already opens its own transaction and locks the dispute row FOR UPDATE before
 * calling this. A failure anywhere after that inner commit (the settlement_lines insert, the
 * status-flip UPDATE, appendCrudAudit, even the outer transaction's own COMMIT) left a
 * permanently-posted corrective JE with the dispute rolled back to still-open — a retry (an Owner
 * naturally re-clicking Approve after seeing an error) would post a SECOND corrective JE for the same
 * dispute, an unguarded double-payment. No unique constraint ties a JE or a settlement_lines
 * ('dispute_adjustment') row to a dispute_id, so nothing else in the schema would catch this.
 *
 * This guard proves createCorrectiveJournalEntry now takes the caller's own client directly (no
 * second withCurrentUser connection inside it) and posts via createJournalEntryOnClient, and that all
 * three call sites pass their own already-open, row-locked client — mirroring
 * escrow-forfeit.service.ts's already-established atomic pattern.
 */
import fs from "node:fs";

const CALL_SITES = [
  { file: "apps/backend/src/driver-finance/settlement-dispute.service.ts", label: "resolveDispute" },
  { file: "apps/backend/src/settlements/disputes/disputes.routes.ts", label: "reviewSettlementDispute" },
  { file: "apps/backend/src/driver-finance/settlement-disputes-p6.service.ts", label: "decideDispute" },
];

export function run(root = process.cwd()) {
  const failures = [];

  const svcSrc = fs.readFileSync(`${root}/apps/backend/src/driver-finance/settlement-dispute.service.ts`, "utf8");

  if (!/import\s*\{\s*createJournalEntryOnClient\s*\}\s*from\s*"\.\.\/accounting\/journal-entries\.service\.js"/.test(svcSrc)) {
    failures.push("settlement-dispute.service.ts must import createJournalEntryOnClient (the client-taking, atomic variant), not the connection-opening createJournalEntry");
  }
  if (/import\s*\{\s*createJournalEntry\s*\}\s*from\s*"\.\.\/accounting\/journal-entries\.service\.js"/.test(svcSrc)) {
    failures.push("settlement-dispute.service.ts must not import the connection-opening createJournalEntry anymore");
  }

  const fnMatch = svcSrc.match(/export async function createCorrectiveJournalEntry\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("createCorrectiveJournalEntry function not found");
    return failures;
  }
  const body = fnMatch[0];

  if (!/export async function createCorrectiveJournalEntry\(\s*client\b/.test(body)) {
    failures.push("createCorrectiveJournalEntry must take the caller's client as its first parameter — opening its own withCurrentUser connection self-deadlocks/double-posts against the caller's already-locked dispute row");
  }
  if (/withCurrentUser\(/.test(body)) {
    failures.push("createCorrectiveJournalEntry must not open its own withCurrentUser connection — it must post on the caller's client");
  }
  if (!/await createJournalEntryOnClient\(\s*client,/.test(body)) {
    failures.push("createCorrectiveJournalEntry must call createJournalEntryOnClient(client, ...) directly on the caller's client");
  }

  for (const site of CALL_SITES) {
    const src = fs.readFileSync(`${root}/${site.file}`, "utf8");
    if (!/createCorrectiveJournalEntry\(\s*client,/.test(src)) {
      failures.push(`${site.file} (${site.label}) must call createCorrectiveJournalEntry(client, ...) passing its own already-open, row-locked client — not the bare object-literal call that used to open a second connection inside the helper`);
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-settlement-dispute-je-atomic-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodService = `
import { createJournalEntryOnClient } from "../accounting/journal-entries.service.js";

export async function createCorrectiveJournalEntry(
  client,
  params
) {
  const flagOn = await isEnabled(client, KEY, {});
  if (!flagOn) return null;
  const accounts = await pickCorrectionAccounts(client, params.operatingCompanyId);
  const je = await createJournalEntryOnClient(
    client,
    { postings: [] },
    { userId: params.actorUserId, role: params.actorRole }
  );
  return je.id;
}
`;
  const goodCallSite = (label) => `
export async function ${label}(userId, userRole, input) {
  return withCurrentUser(userId, async (client) => {
    const dispute = await client.query(\`SELECT ... FOR UPDATE\`, []);
    journalEntryId = await createCorrectiveJournalEntry(client, {
      actorUserId: userId,
    });
  });
}
`;
  mk("apps/backend/src/driver-finance/settlement-dispute.service.ts", goodService + goodCallSite("resolveDispute"));
  mk("apps/backend/src/settlements/disputes/disputes.routes.ts", goodCallSite("reviewSettlementDispute"));
  mk("apps/backend/src/driver-finance/settlement-disputes-p6.service.ts", goodCallSite("decideDispute"));
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the original bug — createCorrectiveJournalEntry opens its own withCurrentUser
  // connection and calls the connection-opening createJournalEntry, no client param.
  const badService = `
import { createJournalEntry } from "../accounting/journal-entries.service.js";

export async function createCorrectiveJournalEntry(params) {
  return withCurrentUser(params.actorUserId, async (client) => {
    const je = await createJournalEntry(
      { postings: [] },
      { userId: params.actorUserId, role: params.actorRole }
    );
    return je.id;
  });
}
`;
  mk("apps/backend/src/driver-finance/settlement-dispute.service.ts", badService + goodCallSite("resolveDispute").replace("createCorrectiveJournalEntry(client, {", "createCorrectiveJournalEntry({"));
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): the original second-connection bug shape should be caught");

  // Regression 2: helper fixed, but one call site still calls it without passing client.
  mk("apps/backend/src/driver-finance/settlement-dispute.service.ts", goodService + goodCallSite("resolveDispute"));
  mk(
    "apps/backend/src/settlements/disputes/disputes.routes.ts",
    goodCallSite("reviewSettlementDispute").replace("createCorrectiveJournalEntry(client, {", "createCorrectiveJournalEntry({")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): a call site not passing client should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-settlement-dispute-corrective-je-atomic --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-settlement-dispute-corrective-je-atomic — OK");
}
