export default {
  name: "verify:settlement-load-bookends-populated",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-load-bookends-populated.mjs"]);
  },
};
