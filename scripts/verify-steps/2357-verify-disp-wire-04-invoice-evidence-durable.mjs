// CLS-DISP-WIRE-04 / ACCT-F61 — unevidenced invoice sends must be durably countable,
// not just logged (verify-step 2357 · Claude ODD band).
export default {
  name: "disp-wire-04-invoice-evidence-durable",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-04-invoice-evidence-durable.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-04-invoice-evidence-durable.mjs"]);
  },
};
