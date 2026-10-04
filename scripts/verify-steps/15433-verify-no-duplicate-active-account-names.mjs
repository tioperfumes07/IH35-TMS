export default {
  name: "verify:no-duplicate-active-account-names",
  run(ctx) {
    ctx.run("node", ["scripts/verify-no-duplicate-active-account-names.mjs"]);
  },
};
