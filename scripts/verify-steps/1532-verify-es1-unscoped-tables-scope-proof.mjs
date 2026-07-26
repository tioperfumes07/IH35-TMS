// ACCT-R-12 / 0519-es1-58 — comprehensive unscoped-table scope-proof + FORCE RLS ratchet.
export default {
  name: "es1-unscoped-tables-scope-proof",
  run(ctx) {
    ctx.run("node", ["scripts/verify-es1-unscoped-tables-scope-proof.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-line-scope-inheritance.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-es1-unscoped-tables-scope-proof.mjs"]);
    ctx.run("node", ["scripts/verify-accounting-line-scope-inheritance.mjs"]);
  },
};
