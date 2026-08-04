// CLS-DISP-WIRE-09 — BOL generate wired on pod-review + load drawer.
export default {
  name: "verify:disp-wire-09-bol-generate",
  async run(ctx) {
    await ctx.run("node", ["scripts/verify-disp-wire-09-bol-generate.mjs", "--selftest"]);
    await ctx.run("node", ["scripts/verify-disp-wire-09-bol-generate.mjs"]);
  },
};
