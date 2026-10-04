export default {
  name: "verify:driver-entity-default",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-entity-default.mjs"]);
  },
};
