export default {
  name: "verify:fleet-cross-entity-assignment-close",
  run(ctx) {
    ctx.run("node", ["scripts/verify-fleet-cross-entity-assignment-close.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-fleet-cross-entity-assignment-close.mjs"]);
  },
};
