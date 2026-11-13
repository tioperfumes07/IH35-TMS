// CC-2 ENG-50 — book-equals-Faro: every active factoring_purchase_line must have
// a payment_application on its linked invoice (Faro subledger parity).
export default {
  name: "verify:verify-book-equals-faro",
  run(ctx) {
    ctx.run("node", ["scripts/verify-book-equals-faro.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-book-equals-faro.mjs"]);
  },
};
