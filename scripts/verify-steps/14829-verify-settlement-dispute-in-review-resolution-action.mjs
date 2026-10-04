export default {
  name: "verify:settlement-dispute-in-review-resolution-action",
  run(ctx) {
    ctx.run("node", ["scripts/verify-settlement-dispute-in-review-resolution-action.mjs"]);
  },
};
