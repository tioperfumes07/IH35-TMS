#!/usr/bin/env node
/**
 * verify-bank-split-vendor-bill-gl-honesty
 *
 * CPA VETO lock for bank-transaction-splits vendor-bill atomic GL:
 *   1) ONE withCompanyScope transaction: FOR UPDATE + bill/lines/payment insert +
 *      postSourceTransactionInClientTx (bill) + postSourceTransactionInClientTx (bill_payment).
 *   2) Dual JE proof before posted=true (entity/source-linked, balanced, expense/AP/bank accounts).
 *   3) No commit-then-compensate: forbid postCreatedBillsGl / revokeIncompleteVendorBillSplit /
 *      swallowed revoke in the vendor-bill path.
 *   4) DB test: isolated company + same-line concurrent + zero-artifact failure + dual JE proof.
 *
 * Executable contract: --selftest / --guard-contract-report (Rule-17 / block-ready C8).
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { runExecutableGuard } from "./guard-executable-contract.mjs";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-bank-split-vendor-bill-gl-honesty";
const SERVICE = "apps/backend/src/banking/bank-transaction-splits.service.ts";
const DB_TEST = "apps/backend/src/banking/__tests__/bank-transaction-splits-vendor-bill.db.test.ts";
const UNIT_TEST = "apps/backend/src/banking/__tests__/bank-transaction-splits-vendor-bill-gl-honesty.test.ts";
const SELF_PATH = fileURLToPath(import.meta.url);

function vendorBillRegion(src) {
  const helperStart = src.search(/async\s+function\s+commitVendorBillSplitLineAtomic\s*\(/);
  if (helperStart >= 0) {
    const nextTop = src
      .slice(helperStart + 10)
      .search(/\nasync\s+function\s+markLineOutcome\b|\nexport\s+async\s+function\s+voidSplit\b/);
    if (nextTop >= 0) return src.slice(helperStart, helperStart + 10 + nextTop);
    return src.slice(helperStart);
  }
  const start = src.search(/if\s*\(\s*isVendorBillLine\s*\)\s*\{/);
  return start >= 0 ? src.slice(start, start + 8000) : "";
}

function inspect(service, dbTest, unitTest) {
  const failures = [];

  if (!/export\s+function\s+evaluateVendorBillGlCompleteness\s*\(/.test(service)) {
    failures.push(`${SERVICE}: must export evaluateVendorBillGlCompleteness`);
  }
  if (!/async\s+function\s+commitVendorBillSplitLineAtomic\s*\(/.test(service)) {
    failures.push(`${SERVICE}: must define commitVendorBillSplitLineAtomic (one-transaction architecture)`);
  }
  if (!/postSourceTransactionInClientTx/.test(service)) {
    failures.push(`${SERVICE}: must use postSourceTransactionInClientTx (canonical in-client poster)`);
  }

  const region = vendorBillRegion(service);
  if (!region) {
    failures.push(`${SERVICE}: commitVendorBillSplitLineAtomic / isVendorBillLine region not found`);
    return failures;
  }

  if (!/FOR UPDATE/.test(region)) {
    failures.push(`${SERVICE}: atomic vendor-bill path must FOR UPDATE the split line / bank txn`);
  }
  const inClientPosts = region.match(/postSourceTransactionInClientTx\s*\(/g) || [];
  if (inClientPosts.length < 2) {
    failures.push(
      `${SERVICE}: atomic path must call postSourceTransactionInClientTx at least twice (bill + bill_payment)`
    );
  }
  if (!/assertVendorBillDualJeProofOnClient|bill_je_|payment_je_/.test(region)) {
    failures.push(`${SERVICE}: must prove dual JE (assertVendorBillDualJeProofOnClient) before mark-posted`);
  }
  if (!/BILL_GL_POSTING_FLAG_KEY|BILL_GL_POSTING_ENABLED/.test(region)) {
    failures.push(`${SERVICE}: must require BILL_GL_POSTING_ENABLED inside the atomic unit`);
  }
  if (!/BILL_PAYMENT_GL_POSTING_FLAG_KEY|BILL_PAYMENT_GL_POSTING_ENABLED/.test(region)) {
    failures.push(`${SERVICE}: must require BILL_PAYMENT_GL_POSTING_ENABLED inside the atomic unit`);
  }

  // Forbid real calls/imports — allow the word only inside comments documenting the ban.
  const codeSansComments = service.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/[^\n]*/g, "");
  if (/postCreatedBillsGl/.test(codeSansComments)) {
    failures.push(`${SERVICE}: must not use postCreatedBillsGl (commit-then-compensate is forbidden)`);
  }
  if (/revokeIncompleteVendorBillSplit/.test(service)) {
    failures.push(`${SERVICE}: must not use revokeIncompleteVendorBillSplit (swallowed compensate-void forbidden)`);
  }
  if (/rows already committed/.test(service)) {
    failures.push(`${SERVICE}: must not keep the old swallow-and-mark-posted catch wording`);
  }
  if (!/VendorBillSplitAtomicError/.test(service)) {
    failures.push(`${SERVICE}: must fail loud via VendorBillSplitAtomicError (or equivalent throw)`);
  }

  if (!/createIsolatedOperatingCompany/.test(dbTest)) {
    failures.push(`${DB_TEST}: must use createIsolatedOperatingCompany`);
  }
  if (/companyId\s*=\s*await\s*ensureIntegrationPrerequisites\s*\(/.test(dbTest)) {
    failures.push(`${DB_TEST}: must not assign companyId from ensureIntegrationPrerequisites`);
  }
  if (!/same-company\/same-line concurrent|exactly one bill posts/.test(dbTest)) {
    failures.push(`${DB_TEST}: must include same-company/same-line concurrent commit regression`);
  }
  if (!/Promise\.all\s*\(\s*\[\s*\n?\s*commitSplit/.test(dbTest) && !/Promise\.all\s*\(\s*\[\s*commitSplit/.test(dbTest)) {
    failures.push(`${DB_TEST}: must Promise.all concurrent commitSplit calls`);
  }
  if (!/ZERO bill\/payment\/JE artifacts|zero artifacts|count\(\)\*.*0/.test(dbTest) && !/toBe\("0"\)/.test(dbTest)) {
    failures.push(`${DB_TEST}: must assert failure leaves zero bill/payment/JE artifacts`);
  }
  if (!/assertDualJeProof|expense\/AP\/bank|apGlAccountId/.test(dbTest)) {
    failures.push(`${DB_TEST}: must prove dual JE accounts (expense/AP/bank)`);
  }
  if (!/already_posted/.test(dbTest)) {
    failures.push(`${DB_TEST}: must cover retry idempotency (already_posted)`);
  }
  if (!/required_gl_flags_off|BILL_GL_POSTING_ENABLED/.test(dbTest)) {
    failures.push(`${DB_TEST}: must cover disabled nested GL flag`);
  }
  if (!/wrong entity/.test(dbTest)) {
    failures.push(`${DB_TEST}: must cover wrong-entity refusal`);
  }

  if (!/evaluateVendorBillGlCompleteness/.test(unitTest)) {
    failures.push(`${UNIT_TEST}: must cover evaluateVendorBillGlCompleteness`);
  }

  return failures;
}

function checkBankSplitVendorBillHonestyFixture(fixture) {
  return inspect(fixture.service ?? "", fixture.dbTest ?? "", fixture.unitTest ?? "");
}

function loadRepositoryFixture() {
  return {
    service: fs.readFileSync(path.join(ROOT, SERVICE), "utf8"),
    dbTest: fs.readFileSync(path.join(ROOT, DB_TEST), "utf8"),
    unitTest: fs.readFileSync(path.join(ROOT, UNIT_TEST), "utf8"),
  };
}

/** Back-compat for unit/import callers that still invoke check()/run(). */
export function check() {
  return checkBankSplitVendorBillHonestyFixture(loadRepositoryFixture());
}
export { check as run };

const goodFixture = {
  service: `
    export function evaluateVendorBillGlCompleteness(r) { return {ok:true}; }
    export class VendorBillSplitAtomicError extends Error {}
    async function commitVendorBillSplitLineAtomic(input) {
      await client.query('SELECT id FROM banking.bank_transactions WHERE id=$1 FOR UPDATE');
      await client.query('SELECT * FROM banking.bank_transaction_splits WHERE line_no=$1 FOR UPDATE');
      const billGlOn = await isEnabled(client, BILL_GL_POSTING_FLAG_KEY, {});
      const payGlOn = await isEnabled(client, BILL_PAYMENT_GL_POSTING_FLAG_KEY, {});
      await postSourceTransactionInClientTx(client, { source_transaction_type: 'bill' }, {});
      await postSourceTransactionInClientTx(client, { source_transaction_type: 'bill_payment' }, {});
      await assertVendorBillDualJeProofOnClient(client, {});
      if (!billGlOn) throw new VendorBillSplitAtomicError('required_gl_flags_off', 'x');
    }
    if (isVendorBillLine) { await commitVendorBillSplitLineAtomic({}); }
  `,
  dbTest: `
    import { createIsolatedOperatingCompany } from "...";
    // same-company/same-line concurrent commits: exactly one bill posts
    await Promise.all([
      commitSplit(a.companyId, a.userId, "Owner", a.txnId),
      commitSplit(a.companyId, a.userId, "Owner", a.txnId),
    ]);
    expect(bills[0]?.c).toBe("0"); // ZERO bill/payment/JE artifacts
    await assertDualJeProof(fx, billId, paymentId); // expense/AP/bank
    expect(reason).toBe("already_posted");
    expect(reason).toBe("required_gl_flags_off"); // BILL_GL_POSTING_ENABLED
    it("wrong entity cannot post", async () => {});
  `,
  unitTest: "evaluateVendorBillGlCompleteness",
};

const badFixture = {
  service: `
    if (isVendorBillLine) {
      const created = await withCompanyScope(...);
      try { await postCreatedBillsGl(); } catch (err) {
        console.error("rows already committed", err);
      }
      await revokeIncompleteVendorBillSplit();
      results.push({ posted: true });
    }
  `,
  dbTest: `companyId = await ensureIntegrationPrerequisites();`,
  unitTest: "",
};

const isDirectRun = process.argv[1] && path.resolve(process.argv[1]) === SELF_PATH;
if (isDirectRun) {
  runExecutableGuard({
    label: LABEL,
    checker: checkBankSplitVendorBillHonestyFixture,
    loadRepositoryFixture,
    goodFixture,
    badFixture,
    expectedBadViolationSubstrings: [
      "postCreatedBillsGl",
      "revokeIncompleteVendorBillSplit",
      "ensureIntegrationPrerequisites",
      "commitVendorBillSplitLineAtomic",
      "createIsolatedOperatingCompany",
    ],
  });
}
