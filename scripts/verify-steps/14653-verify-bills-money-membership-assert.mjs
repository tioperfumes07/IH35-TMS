export default {
  name: "verify:bills-money-membership-assert",
  run(ctx) {
    ctx.run("node", ["scripts/verify-bills-money-membership-assert.mjs"]);
  },
};
