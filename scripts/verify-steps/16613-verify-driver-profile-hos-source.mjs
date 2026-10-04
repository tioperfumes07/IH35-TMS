export default {
  name: "verify:driver-profile-hos-source",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-profile-hos-source.mjs"]);
  },
};
