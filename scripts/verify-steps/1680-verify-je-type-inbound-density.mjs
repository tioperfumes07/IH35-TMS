// Rule 17 — ACCT-LINK-01 JE type inbound density (Cursor even band).
export default {
  name: "je-type-inbound-density",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-je-type-inbound-density.mjs", "--selftest"]) !== 0) return 1;
    if (ctx.run("node", ["scripts/verify-je-type-inbound-density.mjs"]) !== 0) return 1;
    return 0;
  },
};
