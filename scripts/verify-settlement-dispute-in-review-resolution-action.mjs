#!/usr/bin/env node
/** @matrix-built {"modules":["drivers"],"cols":["disputes","connectivity","settlement"],"leaves":["drivers.disputes.in_review.resolution_action","drivers.modal.settlement_dispute_resolve"],"task":"DRV-MONEY-F7314-IN-REVIEW-DISPUTES-HAVE-NO-RESOLUTION-ACTION","vertical":"column-wave"} */
/**
 * DRV-MONEY-F7314-IN-REVIEW-DISPUTES-HAVE-NO-RESOLUTION-ACTION (CC-1, 2026-08-29):
 * /drivers/disputes (SettlementDisputeList.tsx) rendered an Actions cell only for status:'submitted'
 * (a "Start review" button) -- an in_review row rendered no action at all, even though the
 * canonical backend route (PATCH /api/v1/settlement-disputes/:id/review,
 * apps/backend/src/settlements/disputes/disputes.routes.ts) already fully supports approved/
 * denied/partial with a durable corrective JE (createCorrectiveJournalEntry) + a
 * settlement_lines dispute_adjustment row when money is owed, owner-only enforcement
 * (isOwner(userRole) === "Owner"), and an immutable-once-closed guard. The existing records were
 * operationally stranded in review with no UI path to any real outcome. Root-caused live in
 * apps/frontend/src/pages/drivers/SettlementDisputeList.tsx. Fixed by adding a new
 * SettlementDisputeResolveModal (approve/deny/partial, resolution notes >=10 chars matching the
 * backend's own CHECK, a positive resolution amount required for approved/partial) wired to the
 * SAME reviewDispute mutation the existing submitted->in_review action already used, gated to
 * Owner role to match the backend's own enforcement (a non-Owner would only ever see a 403
 * dead-click otherwise). No new money logic was invented -- the backend contract already existed.
 * This guard holds that fix so it cannot regress.
 *
 * Self-test: node scripts/verify-settlement-dispute-in-review-resolution-action.mjs --selftest
 */
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const FILES = {
  list: "apps/frontend/src/pages/drivers/SettlementDisputeList.tsx",
  modal: "apps/frontend/src/pages/drivers/SettlementDisputeResolveModal.tsx",
};
const LABEL = "verify-settlement-dispute-in-review-resolution-action";

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

export function audit(src) {
  const failures = [];
  const list = src.list;
  const modal = src.modal;

  if (!/import \{ SettlementDisputeResolveModal \} from "\.\/SettlementDisputeResolveModal"/.test(list)) {
    failures.push(`${FILES.list}: must import SettlementDisputeResolveModal`);
  }
  if (!/<SettlementDisputeResolveModal/.test(list)) {
    failures.push(`${FILES.list}: must render <SettlementDisputeResolveModal ... /> so an in_review row has a real resolution UI`);
  }
  if (!/row\.status === "in_review" && isOwner/.test(list)) {
    failures.push(
      `${FILES.list}: an in_review row's Actions cell must render a resolve action, gated to Owner role to match the backend's isOwner(userRole) enforcement`
    );
  }

  if (!/"approved"[\s\S]{0,40}"partial"[\s\S]{0,40}"denied"|OUTCOMES/.test(modal)) {
    failures.push(`${FILES.modal}: must offer all three real outcomes (approved/partial/denied)`);
  }
  if (!/notes\.trim\(\)\.length >= 10/.test(modal)) {
    failures.push(`${FILES.modal}: resolution notes must require >=10 trimmed chars, matching the backend's own resolution_notes CHECK`);
  }
  if (!/needsAmount = outcome === "approved" \|\| outcome === "partial"/.test(modal)) {
    failures.push(`${FILES.modal}: a resolution amount must be required for approved/partial outcomes, matching the backend's E_RESOLUTION_AMOUNT_REQUIRED rule`);
  }
  if (!/amountValid = !needsAmount \|\| \(amountCents != null && amountCents > 0\)/.test(modal)) {
    failures.push(`${FILES.modal}: the resolution amount must be validated as a positive integer before the submit button enables`);
  }
  if (!/await onResolve\(\{[\s\S]{0,100}id: dispute\.id,/.test(modal)) {
    failures.push(`${FILES.modal}: the resolve mutation must carry the exact settlement dispute id from the active row`);
  }

  return failures;
}

function loadSrc(root) {
  return {
    list: read(FILES.list),
    modal: read(FILES.modal),
  };
}

if (process.argv.includes("--selftest")) {
  const good = loadSrc(ROOT);
  if (audit(good).length) {
    console.error(`${LABEL} SELFTEST FAIL — real repo state rejected:\n- ${audit(good).join("\n- ")}`);
    process.exit(1);
  }

  // Mutation 1: revert the Actions cell to the old submitted-only shape (drop the in_review branch).
  const droppedInReviewAction = {
    ...good,
    list: good.list.replace(
      `              // DRV-MONEY-F7314 — an in_review row used to render no action at all here, stranding
              // it forever: the canonical review route already supports approved/denied/partial,
              // but nothing in this list ever called it with anything but "in_review". This button
              // is restricted to the Owner role to match the backend's own isOwner(userRole)
              // enforcement (disputes.routes.ts) — a non-Owner would only ever see a 403 dead-click,
              // so the button doesn't render for them rather than offering an action that always fails.
              if (row.status === "in_review" && isOwner) {
                return (
                  <Button type="button" variant="secondary" onClick={() => setResolvingDispute(row)}>
                    Resolve
                  </Button>
                );
              }
              return null;`,
      `              return null;`,
    ),
  };
  if (droppedInReviewAction.list === good.list) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-in-review-action pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedInReviewAction).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped in_review resolve action regression escaped`);
    process.exit(1);
  }

  // Mutation 2: drop the notes-length requirement in the modal (the exact pre-fix-quality shape).
  const droppedNotesCheck = {
    ...good,
    modal: good.modal.replace(
      `const notesValid = notes.trim().length >= 10;`,
      `const notesValid = true;`,
    ),
  };
  if (droppedNotesCheck.modal === good.modal) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-notes-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedNotesCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped resolution-notes length requirement regression escaped`);
    process.exit(1);
  }

  // Mutation 3: drop the amount requirement for approved/partial.
  const droppedAmountCheck = {
    ...good,
    modal: good.modal.replace(
      `const needsAmount = outcome === "approved" || outcome === "partial";`,
      `const needsAmount = false;`,
    ),
  };
  if (droppedAmountCheck.modal === good.modal) {
    console.error(`${LABEL} SELFTEST FAIL — dropped-amount-check pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedAmountCheck).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — dropped resolution-amount requirement regression escaped`);
    process.exit(1);
  }

  // Mutation 4: detach the resolve request from the active dispute row.
  const droppedExactDisputeId = {
    ...good,
    modal: good.modal.replace(`id: dispute.id,`, `id: "wrong-dispute",`),
  };
  if (droppedExactDisputeId.modal === good.modal) {
    console.error(`${LABEL} SELFTEST FAIL — exact-dispute-id pattern did not match source, re-anchor`);
    process.exit(1);
  }
  if (audit(droppedExactDisputeId).length === 0) {
    console.error(`${LABEL} SELFTEST FAIL — detached settlement dispute id escaped`);
    process.exit(1);
  }

  console.log(`${LABEL} SELFTEST PASS — 4 mutations detected`);
  process.exit(0);
}

const failures = audit(loadSrc(ROOT));
if (failures.length) {
  console.error(`${LABEL} FAIL\n- ${failures.join("\n- ")}`);
  process.exit(1);
}
console.log(`${LABEL} PASS — in_review settlement disputes have a real, Owner-role-restricted resolution action (approve/deny/partial)`);
