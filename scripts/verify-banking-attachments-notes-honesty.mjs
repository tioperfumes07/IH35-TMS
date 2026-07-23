#!/usr/bin/env node
/** Banking Full Audit FAIL 27 — bank row attachments/notes honest or wired. */
import fs from "node:fs";

export function run(root = process.cwd()) {
  const failures = [];
  const view = fs.readFileSync(
    `${root}/apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx`,
    "utf8"
  );
  const attachRoutes = fs.readFileSync(`${root}/apps/backend/src/documents/attachments.routes.ts`, "utf8");

  if (!view.includes("banking-bank-row-attachments-notes-honesty-banner")) {
    failures.push("BankingTransactionsDesignView must show attachments/notes honesty banner");
  }
  if (!view.includes("transactionsQuery.isSuccess")) {
    failures.push("attachments/notes honesty banner must gate on transactionsQuery.isSuccess");
  }
  if (!view.includes("border-l-4 border-slate-400 bg-slate-100")) {
    failures.push("attachments/notes honesty banner must use slate palette");
  }
  if (!view.includes("bank_transaction")) {
    failures.push("honesty banner must name missing bank_transaction attachments entity_type");
  }
  if (!view.includes("documents.attachments")) {
    failures.push("honesty banner must name documents.attachments table");
  }
  if (!view.includes("PATCH /api/v1/banking/transactions/:id")) {
    failures.push("honesty banner must name missing notes PATCH route");
  }
  if (!view.includes('data-testid="bank-txn-attach-disabled"') || !view.includes("<Paperclip")) {
    failures.push("paperclip control must be disabled with bank-txn-attach-disabled testid and Paperclip icon");
  }
  if (!view.includes('data-testid="bank-txn-note-disabled"') || !view.includes("<MessageSquare")) {
    failures.push("note control must be disabled with bank-txn-note-disabled testid and MessageSquare icon");
  }

  // Wiring would add bank_transaction to upload enum — honesty guard fails if someone half-wires without banner removal.
  if (attachRoutes.includes('"bank_transaction"') || attachRoutes.includes("'bank_transaction'")) {
    if (!view.includes("bank-txn-attach-enabled") && !view.includes("UploadZone")) {
      failures.push(
        "attachments.routes.ts includes bank_transaction but grid is not wired — wire UI or remove enum until ready"
      );
    }
  }

  return failures;
}

if (process.argv.includes("--selftest")) {
  const tmp = fs.mkdtempSync("/tmp/verify-banking-attach-notes-");
  const mk = (rel, body) => {
    fs.mkdirSync(`${tmp}/${rel.split("/").slice(0, -1).join("/")}`, { recursive: true });
    fs.writeFileSync(`${tmp}/${rel}`, body);
  };
  mk(
    "apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx",
    `transactionsQuery.isSuccess
border-l-4 border-slate-400 bg-slate-100
banking-bank-row-attachments-notes-honesty-banner
bank_transaction
documents.attachments
PATCH /api/v1/banking/transactions/:id
data-testid="bank-txn-attach-disabled"
<button type="button" disabled data-testid="bank-txn-attach-disabled"><Paperclip className="h-4 w-4" /></button>
data-testid="bank-txn-note-disabled"
<button type="button" disabled data-testid="bank-txn-note-disabled"><MessageSquare className="h-4 w-4" /></button>
`
  );
  mk("apps/backend/src/documents/attachments.routes.ts", "entity_type: z.enum([\n");
  if (run(tmp).length) throw new Error("PASS fail: " + run(tmp).join("; "));
  mk("apps/frontend/src/pages/banking/components/BankingTransactionsDesignView.tsx", "x\n");
  if (!run(tmp).length) throw new Error("FAIL fail");
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
