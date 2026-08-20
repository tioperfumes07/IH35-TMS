#!/usr/bin/env node
/**
 * ACCT-F5644 — the forward-posting sibling of ACCT-F5643, flagged in that finding's own REMAINING
 * note. `postEscrowTransaction` (accounting/escrow/service.ts) used to run its ENTIRE body inside its
 * own `withCurrentUser` connection and then post the journal entry via `createJournalEntry` — a
 * DIFFERENT, connection-opening function that opens its OWN, SECOND connection internally and commits
 * independently. Even a standalone call had two connections mid-flight simultaneously: the JE could
 * commit while a later failure (the escrow_postings INSERT, the audit write, the balance re-read)
 * rolled the outer connection back — an orphan, committed journal entry with NO escrow_postings row
 * ever backing it. On top of that, escrow-separation.service.ts's releaseDriverEscrowSeparation
 * already held its own open, row-locked (FOR UPDATE) transaction and could never post atomically with
 * the escrow release at all — a failure between the inner GL commit and the outer status/balance-stamp
 * commit left the escrow cash genuinely released while the separation row rolled back to
 * pending/eligible, and a retry would then compute the release amount against the already-drained
 * balance (likely $0), permanently mis-recording how much escrow was actually returned to a separated
 * driver.
 *
 * This guard proves postEscrowTransactionOnClient (the extracted, client-taking core) posts its
 * journal entry via createJournalEntryOnClient on the SAME client (no internal second connection),
 * that the pre-existing postEscrowTransaction/depositEscrow/releaseEscrow external behavior is
 * preserved via a thin withCurrentUser wrapper, that releaseEscrowOnClient exists for a caller with
 * its own open transaction, and that escrow-separation.service.ts's releaseDriverEscrowSeparation
 * calls releaseEscrowOnClient(client, ...) — its own row-locked client — instead of the
 * connection-opening releaseEscrow.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const svcSrc = fs.readFileSync(`${root}/apps/backend/src/accounting/escrow/service.ts`, "utf8");

  if (!/import\s*\{\s*createJournalEntryOnClient\s*\}\s*from\s*"\.\.\/journal-entries\.service\.js"/.test(svcSrc)) {
    failures.push("escrow/service.ts must import createJournalEntryOnClient (the client-taking, atomic variant), not the connection-opening createJournalEntry");
  }
  if (/import\s*\{\s*createJournalEntry\s*\}\s*from\s*"\.\.\/journal-entries\.service\.js"/.test(svcSrc)) {
    failures.push("escrow/service.ts must not import the connection-opening createJournalEntry anymore");
  }

  const coreMatch = svcSrc.match(/export async function postEscrowTransactionOnClient\([\s\S]*?\n\}/);
  if (!coreMatch) {
    failures.push("postEscrowTransactionOnClient (the client-taking core) not found");
  } else {
    const core = coreMatch[0];
    if (!/export async function postEscrowTransactionOnClient\(\s*client\b/.test(core)) {
      failures.push("postEscrowTransactionOnClient must take the caller's client as its first parameter");
    }
    if (!/await createJournalEntryOnClient\(\s*client,/.test(core)) {
      failures.push("postEscrowTransactionOnClient must post the JE via createJournalEntryOnClient(client, ...) on its own client — no internal second connection");
    }
    if (/withCurrentUser\(/.test(core)) {
      failures.push("postEscrowTransactionOnClient must not open its own withCurrentUser connection");
    }
  }

  const wrapperMatch = svcSrc.match(/async function postEscrowTransaction\([\s\S]*?\n\}/);
  if (!wrapperMatch) {
    failures.push("postEscrowTransaction (the thin external wrapper) not found");
  } else if (!/withCurrentUser\(actor\.userId,\s*\(client\)\s*=>\s*postEscrowTransactionOnClient\(client,/.test(wrapperMatch[0])) {
    failures.push("postEscrowTransaction must delegate to postEscrowTransactionOnClient inside withCurrentUser, preserving pre-existing external behavior for callers with no open transaction");
  }

  if (!/export async function releaseEscrowOnClient\(/.test(svcSrc)) {
    failures.push("releaseEscrowOnClient must be exported for a caller that already holds its own open, row-locked transaction");
  }

  const sepSrc = fs.readFileSync(`${root}/apps/backend/src/driver-finance/escrow-separation.service.ts`, "utf8");
  if (!/import\s*\{\s*releaseEscrowOnClient\s*\}\s*from\s*"\.\.\/accounting\/escrow\/service\.js"/.test(sepSrc)) {
    failures.push("escrow-separation.service.ts must import releaseEscrowOnClient, not the connection-opening releaseEscrow");
  }
  if (!/await releaseEscrowOnClient\(\s*client,/.test(sepSrc)) {
    failures.push("releaseDriverEscrowSeparation must call releaseEscrowOnClient(client, ...) with its own already-open, row-locked client — the original bug called the connection-opening releaseEscrow instead");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-escrow-release-atomic-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodService = `
import { createJournalEntryOnClient } from "../journal-entries.service.js";

export async function postEscrowTransactionOnClient(client, input, actor) {
  const journalEntry = await createJournalEntryOnClient(client, { postings: [] }, actor);
  return { journalEntry };
}

async function postEscrowTransaction(input, actor) {
  return withCurrentUser(actor.userId, (client) => postEscrowTransactionOnClient(client, input, actor));
}

export async function releaseEscrowOnClient(client, input, actor) {
  return postEscrowTransactionOnClient(client, { ...input, posting_type: "release" }, actor);
}
`;
  const goodSeparation = `
import { releaseEscrowOnClient } from "../accounting/escrow/service.js";

export async function releaseDriverEscrowSeparation(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    const sep = await client.query("SELECT ... FOR UPDATE", []);
    const released = await releaseEscrowOnClient(client, { amount_cents: 100 }, { userId: actor.userId, role: actor.role });
  });
}
`;
  mk("apps/backend/src/accounting/escrow/service.ts", goodService);
  mk("apps/backend/src/driver-finance/escrow-separation.service.ts", goodSeparation);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: the original bug — postEscrowTransactionOnClient doesn't exist at all; everything
  // still uses the connection-opening createJournalEntry inside a single withCurrentUser-wrapped
  // postEscrowTransaction, and escrow-separation calls the connection-opening releaseEscrow.
  const badService = `
import { createJournalEntry } from "../journal-entries.service.js";

async function postEscrowTransaction(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    const journalEntry = await createJournalEntry({ postings: [] }, actor);
    return { journalEntry };
  });
}

export async function releaseEscrow(input, actor) {
  return postEscrowTransaction({ ...input, posting_type: "release" }, actor);
}
`;
  const badSeparation = `
import { releaseEscrow } from "../accounting/escrow/service.js";

export async function releaseDriverEscrowSeparation(input, actor) {
  return withCurrentUser(actor.userId, async (client) => {
    const sep = await client.query("SELECT ... FOR UPDATE", []);
    const released = await releaseEscrow({ amount_cents: 100 }, { userId: actor.userId, role: actor.role });
  });
}
`;
  mk("apps/backend/src/accounting/escrow/service.ts", badService);
  mk("apps/backend/src/driver-finance/escrow-separation.service.ts", badSeparation);
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): the original second-connection bug shape (both files) should be caught");

  // Regression 2: escrow/service.ts fixed, but escrow-separation.service.ts still calls
  // releaseEscrowOnClient without passing its own client (the exact bug this guard exists to catch on
  // the caller side even after the helper itself is atomic).
  mk("apps/backend/src/accounting/escrow/service.ts", goodService);
  mk(
    "apps/backend/src/driver-finance/escrow-separation.service.ts",
    goodSeparation.replace("releaseEscrowOnClient(client, {", "releaseEscrowOnClient({")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): a call site not passing its own client should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-escrow-release-atomic --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-escrow-release-atomic — OK");
}
