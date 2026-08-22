export default {
  name: "verify:settle-for-update-scoped-to-settlement-row",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settle-for-update-scoped-to-settlement-row.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-settle-for-update-scoped-to-settlement-row.mjs"]);
  },
};
