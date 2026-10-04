export default {
  name: "verify:d1-settlement-approval",
  run(ctx) {
    ctx.run("node", ["scripts/verify-d1-settlement-approval.mjs"]);
  },
};
