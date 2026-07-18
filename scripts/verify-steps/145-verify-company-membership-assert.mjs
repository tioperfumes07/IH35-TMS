export default {
  name: "verify-company-membership-assert",
  run(ctx) {
    return ctx.run("node", ["scripts/verify-company-membership-assert.mjs"]);
  },
};
