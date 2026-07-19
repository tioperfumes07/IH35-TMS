export default {
  name: "entity-link-adoption",
  run(ctx) {
    if (ctx.run("node", ["scripts/verify-entity-link-adoption.mjs"]) !== 0) {
      throw new Error("verify:entity-link-adoption failed");
    }
  },
};
