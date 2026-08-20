#!/usr/bin/env node
/**
 * ACCT-F5647 — acceptMatchWithResolveDifference (accounting/bank-recon/match.service.ts) had no real
 * duplicate-match protection. loadTransaction's SELECT of the bank transaction carried no FOR UPDATE,
 * and the only guard (`if (txn.review_state === "matched") throw ...`) read from that unlocked row.
 * The final UPDATE clearing the line to review_state='matched' was an unconditional blind write with
 * no `WHERE review_state <> 'matched'` compare-and-swap either. Under READ COMMITTED, two
 * near-simultaneous accept-match calls against the SAME bank_transaction_id but DIFFERENT ledger
 * entries could both pass the unlocked check and both commit: two rows in
 * banking.reconciliation_matches for one bank line (the table's own uniqueness constraint includes
 * the ledger_entry_id, so two DIFFERENT ledger entries don't collide), two different
 * bill_payments/payments rows stamped with the same source_bank_transaction_id, and — if either match
 * had a variance — two independent difference journal entries posted against the same bank cash
 * account, a silent GL overstatement invisible to reconciliation forever (the bank_transactions row
 * only ever shows one of the two matches, last UPDATE wins).
 *
 * This guard proves loadTransaction takes FOR UPDATE when called from acceptMatchWithResolveDifference
 * specifically (not from the read-only findCandidates/previewMatchVariance callers, which must stay
 * lock-free), and that the final clearing UPDATE carries the WHERE review_state <> 'matched' guard
 * with its zero-row result surfaced as an error.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const src = fs.readFileSync(`${root}/apps/backend/src/accounting/bank-recon/match.service.ts`, "utf8");

  if (!/forUpdate\s*=\s*false/.test(src)) {
    failures.push("loadTransaction must default forUpdate to false, so read-only callers (findCandidates, previewMatchVariance) stay lock-free");
  }
  if (!/\$\{forUpdate \? "FOR UPDATE" : ""\}/.test(src)) {
    failures.push("loadTransaction's SELECT must conditionally append FOR UPDATE based on the forUpdate parameter");
  }

  const fnMatch = src.match(/export async function acceptMatchWithResolveDifference\([\s\S]*?\n\}/);
  if (!fnMatch) {
    failures.push("acceptMatchWithResolveDifference function not found");
    return failures;
  }
  const body = fnMatch[0];

  if (!/loadTransaction\(client, input\.operating_company_id, input\.bank_transaction_id, true\)/.test(body)) {
    failures.push("acceptMatchWithResolveDifference must call loadTransaction with forUpdate: true (the 4th argument) — the write path must lock the row it's about to check-then-act on");
  }

  const updateMatch = body.match(/UPDATE banking\.bank_transactions[\s\S]{0,400}?review_state <> 'matched'[\s\S]{0,20}?`/);
  if (!updateMatch) {
    failures.push("the clearing UPDATE (review_state='matched') must carry AND review_state <> 'matched' as a belt-and-suspenders compare-and-swap guard alongside the row lock");
  }
  if (!/if \(cleared\.rowCount === 0\) \{\s*throw new Error\("bank_transaction_already_matched"\);/.test(body)) {
    failures.push("a zero-row clearing UPDATE result (the race case) must be surfaced as bank_transaction_already_matched, not silently ignored");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-bank-recon-accept-match-lock-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const good = `
async function loadTransaction(client, operatingCompanyId, bankTransactionId, forUpdate = false) {
  const txn = await client.query(
    \`
      SELECT bt.id::text, bt.review_state
      FROM banking.bank_transactions bt
      WHERE bt.id = $1::uuid
      LIMIT 1
      \${forUpdate ? "FOR UPDATE" : ""}
    \`,
    [bankTransactionId, operatingCompanyId]
  );
  return txn.rows[0] ?? null;
}

export async function acceptMatchWithResolveDifference(input) {
  return withLuciaBypass(async (client) => {
    const txn = await loadTransaction(client, input.operating_company_id, input.bank_transaction_id, true);
    if (!txn) throw new Error("bank_transaction_not_found");
    if (txn.review_state === "matched") throw new Error("bank_transaction_already_matched");

    const cleared = await client.query(
      \`UPDATE banking.bank_transactions
          SET review_state = 'matched'
        WHERE id = $1::uuid
          AND review_state <> 'matched'\`,
      []
    );
    if (cleared.rowCount === 0) {
      throw new Error("bank_transaction_already_matched");
    }
  });
}
`;
  mk("apps/backend/src/accounting/bank-recon/match.service.ts", good);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression 1: forUpdate:true dropped from the acceptMatchWithResolveDifference call site.
  mk(
    "apps/backend/src/accounting/bank-recon/match.service.ts",
    good.replace(
      "loadTransaction(client, input.operating_company_id, input.bank_transaction_id, true)",
      "loadTransaction(client, input.operating_company_id, input.bank_transaction_id)"
    )
  );
  let f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 1): missing forUpdate:true on the write-path call should be caught");
  mk("apps/backend/src/accounting/bank-recon/match.service.ts", good); // restore

  // Regression 2: the compare-and-swap guard dropped from the clearing UPDATE.
  mk(
    "apps/backend/src/accounting/bank-recon/match.service.ts",
    good.replace("\n          AND review_state <> 'matched'", "")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 2): missing review_state <> 'matched' guard should be caught");
  mk("apps/backend/src/accounting/bank-recon/match.service.ts", good); // restore

  // Regression 3: the zero-row UPDATE result is silently ignored.
  mk(
    "apps/backend/src/accounting/bank-recon/match.service.ts",
    good.replace('if (cleared.rowCount === 0) {\n      throw new Error("bank_transaction_already_matched");\n    }\n  ', "")
  );
  f = run(tmp);
  if (!f.length) throw new Error("FAIL fail (regression 3): silently ignored zero-row UPDATE result should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-bank-recon-accept-match-row-locked --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-bank-recon-accept-match-row-locked — OK");
}
