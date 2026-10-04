export default {
  name: "verify:driver-listing-excludes-pseudo-users",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-listing-excludes-pseudo-users.mjs"]);
  },
};
