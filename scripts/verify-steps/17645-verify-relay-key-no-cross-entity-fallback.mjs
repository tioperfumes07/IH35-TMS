export default {
  name: "verify:relay-key-no-cross-entity-fallback",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-key-no-cross-entity-fallback.mjs"]);
  },
};
