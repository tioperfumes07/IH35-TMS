// verify-steps wrapper for scripts/verify-accounting-toolbar-one-create.mjs
// ACCT-CHROME-UNIFORM-01 — one createControl per accounting list surface (claim 10192 on main).
export default {
  name: "verify-accounting-toolbar-one-create",
  run(ctx) {
    ctx.run("node", ["scripts/verify-accounting-toolbar-one-create.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-accounting-toolbar-one-create.mjs"]);
  },
};
