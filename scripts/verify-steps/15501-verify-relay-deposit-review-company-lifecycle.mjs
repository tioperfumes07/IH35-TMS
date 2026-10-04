export default {
  name: "verify:relay-deposit-review-company-lifecycle",
  run(ctx) {
    ctx.run("node", ["scripts/verify-relay-deposit-review-company-lifecycle.mjs"]);
  },
};
