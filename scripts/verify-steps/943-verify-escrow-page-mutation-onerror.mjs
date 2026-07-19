export default {
  name: "verify-escrow-page-mutation-onerror",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-escrow-page-mutation-onerror.mjs"]) !== 0) {
      throw new Error("verify-escrow-page-mutation-onerror failed");
    }
    if (ctx.run("node", ["scripts/verify-escrow-page-mutation-onerror.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-escrow-page-mutation-onerror selftest failed");
    }
  },
};
