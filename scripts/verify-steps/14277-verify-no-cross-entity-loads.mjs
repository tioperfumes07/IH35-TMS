export default {
  name: "verify:no-cross-entity-loads",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-cross-entity-loads.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-no-cross-entity-loads.mjs"]);
  },
};
