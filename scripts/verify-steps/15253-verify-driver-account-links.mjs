export default {
  name: "verify:driver-account-links",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-account-links.mjs"]);
  },
};
