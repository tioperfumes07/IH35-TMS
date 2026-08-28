#!/usr/bin/env node
/**
 * verify-detention-approval-serialized-lifecycle.mjs (DSP-MONEY-F7132A)
 *
 * approveDetentionRequest used to read the request's status in its OWN, already-committed
 * transaction (no row lock), then do bridge/invoice/evidence across further separate calls, then
 * finish with an UNCONDITIONAL status UPDATE (no WHERE status='pending_review' guard). A concurrent
 * rejectDetentionRequest (which correctly took a `FOR UPDATE` lock + a CAS UPDATE) could land in the
 * gap between the unlocked read and the final write, and the unconditional UPDATE would silently
 * flip a just-rejected request back to 'invoiced' -- billing and notifying for a request the reviewer
 * had already rejected.
 *
 * The fix merges the whole approval sequence into ONE transaction, locks the request row with
 * `FOR UPDATE` from the FIRST read (the same lock rejectDetentionRequest already takes, so the two
 * are now mutually exclusive), and CAS-guards the final status UPDATE as defense in depth. The bridge
 * step now runs via bridgeDetentionToBillingInClientTx (detention.service.ts) inside that same
 * transaction/lock instead of as its own separate, already-committed call.
 *
 * This guard asserts, against the REAL files:
 *   1. approveDetentionRequest's initial SELECT carries `FOR UPDATE OF dr`.
 *   2. its final UPDATE carries `AND status = 'pending_review'` (a CAS, not unconditional).
 *   3. it calls bridgeDetentionToBillingInClientTx (the client-tx variant), not the
 *      standalone-transaction bridgeDetentionToBilling, inside the locked transaction.
 *   4. detention.service.ts's bridgeDetentionToBillingInClientTx takes an explicit client (does not
 *      open its own transaction), and the standalone bridgeDetentionToBilling wraps it (so the
 *      other, non-approval caller in detention.routes.ts is unaffected).
 *
 * FAIL if any of these regress to the pre-fix, race-prone shape.
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const LABEL = "verify-detention-approval-serialized-lifecycle";
const APPROVAL_FILE = "apps/backend/src/dispatch/detention-approval.service.ts";
const DETENTION_FILE = "apps/backend/src/dispatch/detention.service.ts";

function readReal(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

/**
 * Injectable core: pass `sources` to exercise this exact function against synthetic content;
 * omit it to check the real repo files.
 */
export function check(sources) {
  const failures = [];

  const approvalSrc = sources ? sources.approval : (() => { try { return readReal(APPROVAL_FILE); } catch { return null; } })();
  const detentionSrc = sources ? sources.detention : (() => { try { return readReal(DETENTION_FILE); } catch { return null; } })();
  if (approvalSrc == null) return [`${APPROVAL_FILE} not found`];
  if (detentionSrc == null) return [`${DETENTION_FILE} not found`];

  const fnStart = approvalSrc.indexOf("export async function approveDetentionRequest");
  if (fnStart < 0) {
    failures.push(`${APPROVAL_FILE}: approveDetentionRequest not found -- extractor may be stale`);
  } else {
    const fnBody = approvalSrc.slice(fnStart, fnStart + 5000);

    if (!/FOR UPDATE OF dr/.test(fnBody)) {
      failures.push(
        `${APPROVAL_FILE}: approveDetentionRequest's initial SELECT no longer locks the request row ` +
          `(FOR UPDATE OF dr) -- a concurrent reject could race the approval again`
      );
    }

    if (!/WHERE id = \$1 AND operating_company_id = \$5::uuid AND status = 'pending_review'/.test(fnBody)) {
      failures.push(
        `${APPROVAL_FILE}: approveDetentionRequest's final status UPDATE is no longer CAS-guarded ` +
          `(AND status = 'pending_review') -- it may have regressed to an unconditional flip`
      );
    }

    if (!/bridgeDetentionToBillingInClientTx\s*\(\s*client/.test(fnBody)) {
      failures.push(
        `${APPROVAL_FILE}: approveDetentionRequest no longer calls bridgeDetentionToBillingInClientTx ` +
          `with the locked transaction's own client -- it may have regressed to a separate, ` +
          `already-committed bridge call outside the lock`
      );
    }
  }

  const inClientTxStart = detentionSrc.indexOf("export async function bridgeDetentionToBillingInClientTx");
  if (inClientTxStart < 0) {
    failures.push(`${DETENTION_FILE}: bridgeDetentionToBillingInClientTx export not found`);
  } else {
    const inClientTxBody = detentionSrc.slice(inClientTxStart, inClientTxStart + 300);
    if (!/client:\s*PoolClient/.test(inClientTxBody)) {
      failures.push(`${DETENTION_FILE}: bridgeDetentionToBillingInClientTx no longer takes an explicit client parameter`);
    }
  }

  const wrapperStart = detentionSrc.indexOf("export async function bridgeDetentionToBilling(");
  if (wrapperStart < 0) {
    failures.push(`${DETENTION_FILE}: bridgeDetentionToBilling wrapper export not found`);
  } else {
    const wrapperBody = detentionSrc.slice(wrapperStart, wrapperStart + 300);
    if (!/bridgeDetentionToBillingInClientTx\s*\(/.test(wrapperBody)) {
      failures.push(
        `${DETENTION_FILE}: bridgeDetentionToBilling no longer delegates to bridgeDetentionToBillingInClientTx -- ` +
          `its own standalone-transaction caller (detention.routes.ts) and the locked-transaction caller ` +
          `(approveDetentionRequest) could drift into two different implementations`
      );
    }
  }

  return failures;
}

export { check as run };

if (process.argv.includes("--selftest")) {
  const goodApproval = `
    export async function approveDetentionRequest(userId, operatingCompanyId, requestId) {
      const result = await withCompany(userId, operatingCompanyId, async (client) => {
        const res = await client.query(
          \`SELECT dr.* FROM dispatch.detention_requests dr WHERE dr.id = $1 FOR UPDATE OF dr\`,
          [requestId]
        );
        const request = res.rows[0];
        if (!request) return { ok: false, error: "not_found" };
        if (request.status !== "pending_review") return { ok: false, error: "not_pending" };
        const bridge = await bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, request.detention_event_id);
        const updated = await client.query(
          \`UPDATE dispatch.detention_requests SET status = 'invoiced' WHERE id = $1 AND operating_company_id = $5::uuid AND status = 'pending_review' RETURNING *\`,
          [requestId]
        );
        return { ok: true, request: updated.rows[0] };
      });
      return result;
    }
  `;
  const regressedNoLock = goodApproval.replace("FOR UPDATE OF dr", "");
  const regressedNoCas = goodApproval.replace(
    "WHERE id = $1 AND operating_company_id = $5::uuid AND status = 'pending_review'",
    "WHERE id = $1 AND operating_company_id = $5::uuid"
  );
  const regressedSeparateBridge = goodApproval.replace(
    "bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, request.detention_event_id)",
    "bridgeDetentionToBilling(userId, operatingCompanyId, request.detention_event_id)"
  );

  const goodDetention = `
    export async function bridgeDetentionToBillingInClientTx(client: PoolClient, userId, operatingCompanyId, eventId) {
      return { ok: true, event: null, bridge: null };
    }
    export async function bridgeDetentionToBilling(userId, operatingCompanyId, eventId) {
      return withCompany(userId, operatingCompanyId, (client) => bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, eventId));
    }
  `;
  const regressedDetentionNoClientParam = goodDetention.replace("client: PoolClient", "userId2");
  const regressedWrapperReimplements = goodDetention.replace(
    "return withCompany(userId, operatingCompanyId, (client) => bridgeDetentionToBillingInClientTx(client, userId, operatingCompanyId, eventId));",
    "return withCompany(userId, operatingCompanyId, async (client) => { return { ok: true }; });"
  );

  const checks = [
    ["fully-fixed shape produces zero failures", check({ approval: goodApproval, detention: goodDetention }).length === 0],
    ["missing FOR UPDATE lock is caught", check({ approval: regressedNoLock, detention: goodDetention }).some((f) => f.includes("no longer locks the request row"))],
    ["missing final CAS guard is caught", check({ approval: regressedNoCas, detention: goodDetention }).some((f) => f.includes("no longer CAS-guarded"))],
    ["regressing to the separate standalone-transaction bridge call is caught", check({ approval: regressedSeparateBridge, detention: goodDetention }).some((f) => f.includes("no longer calls bridgeDetentionToBillingInClientTx"))],
    ["bridgeDetentionToBillingInClientTx losing its client param is caught", check({ approval: goodApproval, detention: regressedDetentionNoClientParam }).some((f) => f.includes("no longer takes an explicit client"))],
    ["bridgeDetentionToBilling wrapper reimplementing instead of delegating is caught", check({ approval: goodApproval, detention: regressedWrapperReimplements }).some((f) => f.includes("no longer delegates to"))],
    ["real repo files currently satisfy this guard (no args = real files)", check().length === 0],
  ];
  const failed = checks.filter(([, ok]) => !ok);
  if (failed.length) {
    console.error(`${LABEL} --selftest FAIL:`);
    for (const [n] of failed) console.error("  ✗ " + n);
    process.exit(1);
  }
  console.log(`${LABEL} --selftest PASS (${checks.length} checks)`);
  process.exit(0);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const failures = check();
  if (failures.length) {
    console.error(`${LABEL} FAIL:`);
    for (const f of failures) console.error("  ✗ " + f);
    process.exit(1);
  }
  console.log(`${LABEL} PASS — detention approval and rejection are mutually exclusive via a shared row lock, and the final status flip is CAS-guarded`);
}
