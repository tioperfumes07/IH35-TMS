export default {
  name: "verify:driver-profile-tabs-read-only-and-attributed",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-tabs-read-only-and-attributed.mjs"]);
  },
};
