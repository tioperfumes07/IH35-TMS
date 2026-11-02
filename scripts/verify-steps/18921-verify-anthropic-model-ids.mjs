export default {
  name: "verify:anthropic-model-ids",
  run(ctx) {
    ctx.run("node", ["scripts/verify-anthropic-model-ids.mjs"]);
  },
};
