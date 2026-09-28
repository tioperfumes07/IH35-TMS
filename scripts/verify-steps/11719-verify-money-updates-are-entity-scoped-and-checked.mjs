export default {
  name: "verify:money-updates-are-entity-scoped-and-checked",
  run(ctx) {
    ctx.run("node", ["scripts/verify-money-updates-are-entity-scoped-and-checked.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-money-updates-are-entity-scoped-and-checked.mjs"]);
  },
};
