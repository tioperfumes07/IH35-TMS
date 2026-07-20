export default {
  name: "verify:legal-matters-list-row-deeplink",
  run(ctx) {
    ctx.run("node", ["scripts/verify-legal-matters-list-row-deeplink.mjs", "--selftest"]);
    ctx.run("node", ["scripts/verify-legal-matters-list-row-deeplink.mjs"]);
  },
};
