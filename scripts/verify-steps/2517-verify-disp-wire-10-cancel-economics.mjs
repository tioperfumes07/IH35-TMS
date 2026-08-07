// CLS-DISP-WIRE-10 — cancelling a load must not leave phantom A/R or a phantom payable
// (verify-step 2517 · CC-1 lane n%4==1, claimed on main by #4328).
export default {
  name: "disp-wire-10-cancel-economics",
  run(ctx) {
    ctx.run("node", ["scripts/verify-disp-wire-10-cancel-economics.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-disp-wire-10-cancel-economics.mjs"]);
  },
};
