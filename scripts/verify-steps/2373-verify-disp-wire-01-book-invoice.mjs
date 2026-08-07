// CLS-DISP-WIRE-01 — booking creates a non-posting proforma; a missing-column skip must be
// countable, never silent (verify-step 2373 · Claude ODD band).
export default {
  name: "disp-wire-01-book-invoice",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-01-book-invoice.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-01-book-invoice.mjs"]);
  },
};
