#!/usr/bin/env node
/** @matrix-built {"modules":["dispatch"],"cols":["detention","connectivity"],"leaves":["dispatch.detention.customer_notify.claim_before_send"],"task":"DSP-MONEY-F7146A-R1-DETENTION-APPROVAL-NOTICE-STILL-CHECK-SEND-STAMP","vertical":"column-wave"} */
/**
 * DSP-MONEY-F7146A-R1-DETENTION-APPROVAL-NOTICE-STILL-CHECK-SEND-STAMP (CC-1, 2026-08-29):
 * notifyCustomerOfApprovedDetention's idempotency guard used to be a plain, unlocked SELECT read of
 * customer_notified_at, followed by the external sendEmail call, followed by a
 * conditional-but-result-unchecked UPDATE. Two concurrent approval-notification calls for the same
 * request could both pass the SELECT (neither had stamped yet) and both send the customer the same
 * detention-charge email — the final UPDATE's own `WHERE customer_notified_at IS NULL` guard only
 * prevented a double STAMP, not a double SEND. Root-caused live: the SELECT-then-send-then-UPDATE
 * ordering in apps/backend/src/dispatch/detention-approval.service.ts. Fixed by claiming atomically
 * (a single UPDATE ... WHERE customer_notified_at IS NULL RETURNING id) BEFORE sending — only the
 * caller that wins the claim proceeds to send; the old post-send UPDATE is removed as redundant.
 * This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-detention-notify-claim-before-send.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  service: "apps/backend/src/dispatch/detention-approval.service.ts",
};
const LABEL = "verify-detention-notify-claim-before-send";

export function audit(src) {
  const failures = [];
  const fnMatch = src.service.match(
    /async function notifyCustomerOfApprovedDetention\([\s\S]*?\n\}/,
  );
  if (!fnMatch) {
    failures.push(`${FILES.service}: notifyCustomerOfApprovedDetention not found`);
    return failures;
  }
  const body = fnMatch[0];

  const claimMatch = body.match(
    /const claimed = await withCompany\(userId, operatingCompanyId, async \(client\) => \{[\s\S]*?\n    \}\);/,
  );
  if (!claimMatch) {
    failures.push(`${FILES.service}: the claim block was not found`);
    return failures;
  }
  const claimBody = claimMatch[0];
  if (!/UPDATE dispatch\.detention_requests/.test(claimBody)) {
    failures.push(
      `${FILES.service}: the idempotency claim must be an UPDATE (atomic claim), not a plain SELECT — ` +
        `a SELECT-only claim lets two concurrent callers both pass before either stamps`,
    );
  }
  if (!/WHERE id = \$1 AND operating_company_id = \$2::uuid AND customer_notified_at IS NULL/.test(claimBody)) {
    failures.push(`${FILES.service}: the claim UPDATE must be conditioned on customer_notified_at IS NULL`);
  }
  if (!/RETURNING id/.test(claimBody)) {
    failures.push(`${FILES.service}: the claim UPDATE must carry RETURNING id so the caller can detect a lost race`);
  }
  if (!/return res\.rows\.length > 0;/.test(claimBody)) {
    failures.push(`${FILES.service}: the claim result check must be based on whether a row was actually returned`);
  }

  // Order matters: the claim must run BEFORE sendEmail.
  const claimIdx = body.indexOf("const claimed = await withCompany");
  const sendIdx = body.indexOf("await sendEmail({");
  if (claimIdx === -1 || sendIdx === -1 || claimIdx > sendIdx) {
    failures.push(`${FILES.service}: the atomic claim must run BEFORE sendEmail — claiming after sending defeats the fix`);
  }

  // The old post-send UPDATE must not have returned — it's redundant now that the claim itself stamps.
  const afterSend = body.slice(sendIdx);
  if (/UPDATE dispatch\.detention_requests/.test(afterSend)) {
    failures.push(`${FILES.service}: a second UPDATE after sendEmail reappeared — the claim above already stamps, a second write is redundant and reintroduces the old ordering`);
  }

  return failures;
}

function loadSrc(root) {
  return {
    service: fs.readFileSync(path.join(root, FILES.service), "utf8"),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }
  // Mutation 1: revert the claim to a plain SELECT (the exact pre-fix shape).
  const revertedToSelect = {
    service: good.service.replace(
      `      const res = await client.query(
        \`UPDATE dispatch.detention_requests
         SET customer_notified_at = now(), updated_at = now()
         WHERE id = $1 AND operating_company_id = $2::uuid AND customer_notified_at IS NULL
         RETURNING id\`,
        [requestId, operatingCompanyId]
      );
      return res.rows.length > 0;`,
      `      const res = await client.query(
        \`SELECT customer_notified_at FROM dispatch.detention_requests
         WHERE id = $1 AND operating_company_id = $2::uuid\`,
        [requestId, operatingCompanyId]
      );
      return res.rows[0] && !res.rows[0].customer_notified_at;`,
    ),
  };
  if (revertedToSelect.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — SELECT-revert pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(revertedToSelect).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — SELECT-only claim regression escaped`);
    process.exit(1);
  }
  // Mutation 2: reintroduce a second UPDATE after sendEmail (the old post-send stamp).
  const reintroducedPostSend = {
    service: good.service.replace(
      `    return { sent: true };
  } catch {`,
      `    await withCompany(userId, operatingCompanyId, (client) =>
      client.query(
        \`UPDATE dispatch.detention_requests
         SET customer_notified_at = now(), updated_at = now()
         WHERE id = $1 AND operating_company_id = $2::uuid AND customer_notified_at IS NULL\`,
        [requestId, operatingCompanyId]
      )
    );

    return { sent: true };
  } catch {`,
    ),
  };
  if (reintroducedPostSend.service === good.service) {
    console.error(`${LABEL} SELFTEST FAIL — post-send-UPDATE-reintroduction pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(reintroducedPostSend).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — reintroduced post-send UPDATE escaped`);
    process.exit(1);
  }
  console.log(`${LABEL} SELFTEST PASS — 2 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — detention customer-notify claims atomically before sending, no double-send race`);
