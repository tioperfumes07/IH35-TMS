#!/usr/bin/env node
/**
 * ACCT-F5646 — approveAndPostFuelCardOverage → postFuelOverageReceivable had exactly two
 * duplicate-post guards, and neither was real. Both were plain SELECTs with no FOR UPDATE — under
 * READ COMMITTED, two concurrent approve calls for the same overage_event_id (double-click, or a
 * client retry after a slow/timed-out response) could both read journal_entry_id IS NULL, both pass,
 * both post a fully-balanced JE (Dr fuel_overage_receivable / Cr fuel expense) via
 * createJournalEntryOnClient, then both UPDATE journal_entry_id — last write wins, permanently
 * orphaning the other JE with no traceable link from the event row and no unique constraint to catch
 * it. The second guard (a `batchHit` lookup against accounting.posting_batches) was structurally
 * vacuous: createJournalEntryOnClient (the only JE writer this path calls) never inserts into
 * posting_batches and the idempotencyKey this function built was never even passed to it — the same
 * dead-guard shape as the already-fixed LV-TXN-009 finding.
 *
 * This guard proves both SELECTs now take FOR UPDATE and that the vacuous posting_batches
 * idempotency check is gone (not left as misleading dead code).
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];

  const engineSrc = fs.readFileSync(`${root}/apps/backend/src/fuel/fuel-card-overage.service.ts`, "utf8");
  const fnMatch = engineSrc.match(/export async function approveAndPostFuelCardOverage\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("approveAndPostFuelCardOverage function not found");
  } else {
    const fnBody = fnMatch[0];
    const eventSelectMatch = fnBody.match(/SELECT id::text,[\s\S]*?FROM fuel\.fuel_card_overage_events[\s\S]*?LIMIT 1[\s\S]*?`/);
    if (!eventSelectMatch) {
      failures.push("could not locate the overage event SELECT inside approveAndPostFuelCardOverage");
    } else if (!/FOR UPDATE/.test(eventSelectMatch[0])) {
      failures.push("approveAndPostFuelCardOverage's overage-event SELECT must use FOR UPDATE — two concurrent approve calls could both read journal_entry_id IS NULL before either commits");
    }
  }

  const postingSrc = fs.readFileSync(`${root}/apps/backend/src/fuel/fuel-card-overage-posting.service.ts`, "utf8");
  const existingSelectMatch = postingSrc.match(/SELECT journal_entry_id::text[\s\S]*?FROM fuel\.fuel_card_overage_events[\s\S]*?LIMIT 1[\s\S]*?`/);
  if (!existingSelectMatch) {
    failures.push("could not locate the existing-JE SELECT in postFuelOverageReceivable");
  } else if (!/FOR UPDATE/.test(existingSelectMatch[0])) {
    failures.push("postFuelOverageReceivable's existing-JE SELECT must use FOR UPDATE — belt-and-suspenders for any direct/future caller not already holding the lock");
  }

  if (/FROM\s+accounting\.posting_batches/.test(postingSrc)) {
    failures.push("postFuelOverageReceivable must not query accounting.posting_batches — createJournalEntryOnClient never writes there, so that check is structurally vacuous and must not be reintroduced as misleading dead code");
  }
  if (/buildIdempotencyKey/.test(postingSrc)) {
    failures.push("the dead buildIdempotencyKey helper (only ever fed the vacuous posting_batches check) must not be reintroduced");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-fuel-overage-lock-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodEngine = `
export async function approveAndPostFuelCardOverage(input) {
  return withLuciaBypass(async (rawClient) => {
    const client = rawClient;
    const event = await client.query(
      \`
        SELECT id::text,
               fuel_transaction_id::text,
               journal_entry_id::text
          FROM fuel.fuel_card_overage_events
         WHERE id = $1::uuid
         LIMIT 1
         FOR UPDATE
      \`,
      []
    );
  });
}
`;
  const goodPosting = `
  const existing = await client.query(
    \`
      SELECT journal_entry_id::text
        FROM fuel.fuel_card_overage_events
       WHERE id = $1::uuid
         AND journal_entry_id IS NOT NULL
       LIMIT 1
       FOR UPDATE
    \`,
    []
  );
  if (existing.rows[0]?.journal_entry_id) {
    return { status: "already_posted", journal_entry_id: existing.rows[0].journal_entry_id };
  }
  const je = await createJournalEntryOnClient(client, {}, {});
`;
  mk("apps/backend/src/fuel/fuel-card-overage.service.ts", goodEngine);
  mk("apps/backend/src/fuel/fuel-card-overage-posting.service.ts", goodPosting);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: FOR UPDATE dropped from the engine's event SELECT.
  mk("apps/backend/src/fuel/fuel-card-overage.service.ts", goodEngine.replace("\n         FOR UPDATE", ""));
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): missing FOR UPDATE on the engine's event SELECT should be caught");
  mk("apps/backend/src/fuel/fuel-card-overage.service.ts", goodEngine); // restore

  // Regression 2: FOR UPDATE dropped from postFuelOverageReceivable's existing SELECT.
  mk("apps/backend/src/fuel/fuel-card-overage-posting.service.ts", goodPosting.replace("\n       FOR UPDATE", ""));
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): missing FOR UPDATE on postFuelOverageReceivable's SELECT should be caught");
  mk("apps/backend/src/fuel/fuel-card-overage-posting.service.ts", goodPosting); // restore

  // Regression 3: the vacuous posting_batches idempotency check reintroduced.
  mk(
    "apps/backend/src/fuel/fuel-card-overage-posting.service.ts",
    goodPosting +
      `
  const idempotencyKey = buildIdempotencyKey("oc", "txn");
  const batchHit = await client.query(
    \`SELECT jep.journal_entry_uuid::text FROM accounting.posting_batches pb JOIN accounting.journal_entry_postings jep ON jep.posting_batch_id = pb.id WHERE pb.idempotency_key = $1\`,
    []
  );
`
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 3): the vacuous posting_batches idempotency check should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-fuel-card-overage-row-locked --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-fuel-card-overage-row-locked — OK");
}
