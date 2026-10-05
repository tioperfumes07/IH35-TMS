// Leaf-specific connectivity coverage for the 23 unowned non-money remainder cells (Devin, 2026-10-05).
export default {
  name: "verify:nonmoney-connectivity-remainder",
  run(ctx) {
    ctx.run("node", ["scripts/verify-nonmoney-connectivity-remainder.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-nonmoney-connectivity-remainder.mjs"]);
  },
};
