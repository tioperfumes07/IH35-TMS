// CLS-DISP-WIRE-05 — the two-event revenue latch: earn only on captured delivery evidence
// (verify-step 2505 · CC-1 block 25xx).
export default {
  name: "disp-wire-05-revrec-latch",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-05-revrec-latch.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-05-revrec-latch.mjs"]);
  },
};
