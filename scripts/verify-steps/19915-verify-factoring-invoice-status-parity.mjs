// CC-2 Row 77 — CODER-34: invoice.status must stay 'sent' after a Faro advance (not 'factored').
// Also: every advanced invoice must have a factoring_purchase_line.
export default {
  name: "verify:verify-factoring-invoice-status-parity",
  run(ctx) {
    ctx.run("node", ["scripts/verify-factoring-invoice-status-parity.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-factoring-invoice-status-parity.mjs"]);
  },
};
