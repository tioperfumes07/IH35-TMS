export default {
  name: "verify-unit-parts-history-reverse-drill",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-unit-parts-history-reverse-drill.mjs", "--selftest"]) !== 0) {
      throw new Error("verify-unit-parts-history-reverse-drill --selftest failed");
    }
    if (ctx.run("node", ["scripts/verify-unit-parts-history-reverse-drill.mjs"]) !== 0) {
      throw new Error("verify-unit-parts-history-reverse-drill failed");
    }
  },
};
