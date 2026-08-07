// CLS-DISP-WIRE-02 / ACCT-F63 — driver pay must never derive from the customer rate
// (verify-step 2501 — CC-1 block 25xx, renumbered off a 2377 collision · Claude ODD band).
export default {
  name: "disp-wire-02-driver-bill",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-02-driver-bill.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-02-driver-bill.mjs"]);
  },
};
