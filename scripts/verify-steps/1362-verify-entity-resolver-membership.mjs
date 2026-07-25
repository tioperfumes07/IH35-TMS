export default {
  name: "verify:entity-resolver-membership",
  run(ctx) {
    ctx.run("node", ["scripts/verify-entity-resolver-membership.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-entity-resolver-membership.mjs"]);
  },
};
