// verify-steps wrapper for scripts/verify-invoice-create-modal-customer-link.mjs
// ACCT-INVOICE-CREATE-CUSTOMER-LINK — InvoiceCreateModal.tsx's from-load pick table's "Load #"
// column was already fixed (C5) to drill through a real EntityLink, but the "Customer" column right
// next to it — same row, same real id (customer_id) — rendered through bare entityLabel() text with
// no link. Fixed by wrapping it in EntityLink kind="customer", matching the Load # column exactly.
// Rule 37 claim-then-author (claim shipped in #13682). Static, no DB.
export default {
  name: "verify-invoice-create-modal-customer-link",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-create-modal-customer-link.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-invoice-create-modal-customer-link.mjs"]);
  },
};
