export default {
  name: "verify:invoice-factor-profile-linkage",
  run(ctx) {
    ctx.run("node", ["scripts/verify-invoice-factor-profile-linkage.mjs"]);
  },
};
