export default {
  name: "verify:no-lowest-uuid-entity-resolution",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-lowest-uuid-entity-resolution.mjs", "--selftest"]);
    return ctx.run("node", ["scripts/verify-no-lowest-uuid-entity-resolution.mjs"]);
  },
};
