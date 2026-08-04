// CLS-DISP-WIRE-03 — driver POD capture FE→API→INSERT chain (ops density out of scope).
export default {
  name: "verify:disp-wire-03-pod-capture",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-disp-wire-03-pod-capture.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-disp-wire-03-pod-capture.mjs"]);
  },
};
