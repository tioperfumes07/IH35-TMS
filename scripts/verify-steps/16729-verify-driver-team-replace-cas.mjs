export default {
  name: "verify:driver-team-replace-cas",
  run(ctx) {
    ctx.run("node", ["scripts/verify-driver-team-replace-cas.mjs"]);
  },
};
