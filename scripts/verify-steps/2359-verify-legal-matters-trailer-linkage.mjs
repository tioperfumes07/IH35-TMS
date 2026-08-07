// CLS-REVERSE-LINKAGE-MISSING — trailer→legal.matters reverse linkage, end to end
// (verify-step 2359 · Claude ODD band).
export default {
  name: "legal-matters-trailer-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-matters-trailer-linkage.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-legal-matters-trailer-linkage.mjs"]);
  },
};
