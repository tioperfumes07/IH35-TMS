#!/usr/bin/env node
/**
 * ACCT-F5621 — bank row attachments/notes must be REALLY wired, not a disabled stub with an
 * honest banner. This guard previously asserted the OPPOSITE (a disabled control + a banner
 * explaining why) back when documents.attachments.entity_type had no 'bank_transaction' member
 * and there was no notes PATCH route. Both now exist — this guard flips to asserting the built
 * state and fails closed if any of the three allowlists (DB CHECK / backend Zod enum / frontend
 * TS union) or the notes route regress.
 */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const view = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
    "utf8"
  );
  const modal = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankTransactionAttachmentsNotesModal.tsx`,
    "utf8"
  );
  const attachRoutes = fs.readFileSync(`${root}/apps/backend/src/documents/attachments.routes.ts`, "utf8");
  const attachApi = fs.readFileSync(`${root}/apps/frontend/src/api/attachments.ts`, "utf8");
  const bankingApi = fs.readFileSync(`${root}/apps/frontend/src/api/banking.ts`, "utf8");
  const linkRoutes = fs.readFileSync(`${root}/apps/backend/src/integrations/plaid/link.routes.ts`, "utf8");

  // The disabled stub + honesty banner must be GONE — a half-regression that re-disables the
  // controls but forgets to restore the banner would silently look "wired" while being dead.
  if (view.includes("banking-bank-row-attachments-notes-honesty-banner")) {
    failures.push("stale disabled-state honesty banner must be removed now that the feature is wired");
  }
  if (view.includes("bank-txn-attach-disabled") || view.includes("bank-txn-note-disabled")) {
    failures.push("paperclip/note controls must no longer be the disabled stub");
  }

  // The controls must be real, enabled buttons that open the attachments/notes modal.
  if (!view.includes('data-testid="bank-txn-attach"') || !view.includes("<Paperclip")) {
    failures.push("paperclip control must exist (bank-txn-attach testid) and render the Paperclip icon");
  }
  if (!view.includes('data-testid="bank-txn-note"') || !view.includes("<MessageSquare")) {
    failures.push("note control must exist (bank-txn-note testid) and render the MessageSquare icon");
  }
  if (!view.includes("setAttachNotesTx(tx)")) {
    failures.push("attach/note controls must open the attachments/notes modal (setAttachNotesTx)");
  }
  if (!view.includes("BankTransactionAttachmentsNotesModal")) {
    failures.push("BankingTransactionsDesignView must render BankTransactionAttachmentsNotesModal");
  }

  // The modal must use the real UploadZone (same component every other module uses) with
  // entityType="bank_transaction", and call the real notes-save API.
  if (!modal.includes("UploadZone") || !modal.includes('entityType="bank_transaction"')) {
    failures.push('BankTransactionAttachmentsNotesModal must render <UploadZone entityType="bank_transaction" ...>');
  }
  if (!modal.includes("addBankTransactionNote")) {
    failures.push("BankTransactionAttachmentsNotesModal must call addBankTransactionNote to save notes");
  }

  // Three allowlists that must move together (documented in the migration's own comment): DB CHECK
  // (verified separately by the migration itself), backend Zod enum, frontend TS union.
  if (!attachRoutes.includes('"bank_transaction"') && !attachRoutes.includes("'bank_transaction'")) {
    failures.push("attachments.routes.ts entity_type enum must include bank_transaction");
  }
  if (!attachApi.includes('"bank_transaction"')) {
    failures.push("api/attachments.ts AttachmentEntityType union must include bank_transaction");
  }

  // The notes PATCH route + its frontend caller must both exist.
  if (!bankingApi.includes("addBankTransactionNote")) {
    failures.push("api/banking.ts must export addBankTransactionNote");
  }
  if (!linkRoutes.includes('"/api/v1/banking/transactions/:id/notes"')) {
    failures.push("link.routes.ts must register PATCH /api/v1/banking/transactions/:id/notes");
  }
  // Append-only, not overwrite: the UPDATE must concat onto any existing notes, never replace them.
  if (!linkRoutes.includes("ELSE concat(notes, E'\\\\n', $3::text)")) {
    failures.push("notes PATCH must append via concat(notes, ...), never overwrite the existing notes column");
  }
  // Role-gated like every other owner/admin banking mutation route — not open to every role.
  if (!/\/notes"[\s\S]{0,400}?ensureRole\(reply, user\.role, ownerAdminRoles\)/.test(linkRoutes)) {
    failures.push("notes PATCH route must be gated by ensureRole(..., ownerAdminRoles)");
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-attach-notes-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  const goodView = `
    <button type="button" data-testid="bank-txn-attach" onClick={() => setAttachNotesTx(tx)}><Paperclip className="h-4 w-4" /></button>
    <button type="button" data-testid="bank-txn-note" onClick={() => setAttachNotesTx(tx)}><MessageSquare className="h-4 w-4" /></button>
    <BankTransactionAttachmentsNotesModal open={Boolean(attachNotesTx)} />
  `;
  const goodModal = `
    <UploadZone entityType="bank_transaction" entityId={tx.id} />
    addBankTransactionNote(tx.id, operatingCompanyId, draftNote)
  `;
  const goodLinkRoutes = `
    app.patch(
      "/api/v1/banking/transactions/:id/notes",
      async (req, reply) => {
        if (!ensureRole(reply, user.role, ownerAdminRoles)) return;
        \`UPDATE banking.bank_transactions SET notes = CASE WHEN notes IS NULL OR notes = '' THEN $3::text ELSE concat(notes, E'\\\\n', $3::text) END\`
      }
    );
  `;
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", goodView);
  mk("apps/frontend/src/pages/banking/components/BankTransactionAttachmentsNotesModal.tsx", goodModal);
  mk("apps/backend/src/documents/attachments.routes.ts", 'entity_type: z.enum(["bank_transaction"])\n');
  mk("apps/frontend/src/api/attachments.ts", '"bank_transaction"\n');
  mk("apps/frontend/src/api/banking.ts", "export function addBankTransactionNote() {}\n");
  mk("apps/backend/src/integrations/plaid/link.routes.ts", goodLinkRoutes);
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));

  // Regression: re-disabling the controls without restoring the banner must fail.
  mk(
    "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    goodView.replace('data-testid="bank-txn-attach"', 'data-testid="bank-txn-attach-disabled"')
  );
  if (!run(tmp).length) throw new Error("FAIL fail: regressed disabled control should be caught");

  fs.rmSync(tmp, { recursive: true, force: true });
  console.log("verify-banking-attachments-notes-honesty --selftest OK");
} else {
  const f = run();
  if (f.length) {
    console.error(f.join("\n"));
    process.exit(1);
  }
  console.log("verify-banking-attachments-notes-honesty — OK");
}
